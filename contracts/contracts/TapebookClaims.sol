// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IBeacon} from "@openzeppelin/contracts/proxy/beacon/IBeacon.sol";
import {ICPU} from "./tapeout/interfaces/ICPU.sol";
import {MiterLib} from "./MiterLib.sol";

interface ITapeOutFactory {
    function isCPU(address) external view returns (bool);
    function circuitBeacon() external view returns (address);
}

/// @title TapebookClaims — bonded, breakable claims that a TapeOut circuit matches a spec.
/// @notice A claim says "circuit (cpu, id) behaves exactly like spec S on every input".
///         It is checked only one way: anyone who finds one input where the miter
///         (target vs spec) returns 1 breaks the claim and takes the bond.
///         All evaluation is TapeOut's own on-chain `eval`.
///
///         No owner, no admin, not upgradeable, no fee. Pull payments only.
///         External calls are view calls to the factory, its circuit beacon,
///         the Tapebook Circuits contract and the claim's target.
contract TapebookClaims is ReentrancyGuard {
    enum Status {
        None,
        Open,
        Broken
    }

    struct Claim {
        address cpu;
        uint256 id;
        uint256 specId;
        uint256 miterId;
        address claimant;
        uint96 bond;
        uint64 postedAt;
        uint64 lockUntil;
        Status status;
        bytes32 targetHash;
        uint32 nIn;
        address circuitImpl; // circuitBeacon.implementation() at post
        address breaker;
        bytes counterexample;
    }

    struct SpecInfo {
        address owner;
        string name;
        string uri;
    }

    uint256 public constant MAX_BOND = 1 ether; // OKB
    uint32 public constant MAX_GATES = 1000; // miter circuitInfo.gateCount (recursive total)
    uint64 public constant MIN_LOCK = 1 days;
    uint64 public constant REVEAL_DELAY = 1; // blocks
    uint256 public constant MAX_VECTORS = 16;

    ITapeOutFactory public immutable factory;
    ICPU public immutable tapebook; // the Tapebook processor (its Circuits address)
    address public immutable circuitBeacon;

    uint256 public claimCount; // claim ids start at 1

    mapping(uint256 => Claim) public claims;
    mapping(bytes32 => uint256) public openClaimOf; // keccak256(cpu, id, specId) → claimId
    mapping(bytes32 => uint64) public commitBlock; // commitment → block number
    mapping(address => uint256) public credit; // pull payments
    mapping(uint256 => SpecInfo) public specs; // specId → {owner, name, uri}

    uint256[] private _vecSpecIds;
    bytes[] private _vecIns;
    bytes[] private _vecOuts;

    event SpecRegistered(uint256 indexed specId, address indexed owner, string name, string uri);
    event Posted(
        uint256 indexed claimId,
        address indexed cpu,
        uint256 indexed id,
        uint256 specId,
        uint256 miterId,
        address claimant,
        uint256 bond,
        uint64 lockUntil,
        address circuitImpl
    );
    event Committed(bytes32 indexed h, address indexed sender);
    event Broken(uint256 indexed claimId, address indexed breaker, bytes x, uint256 bondPaid, address circuitImpl);
    event BondChanged(uint256 indexed claimId, uint256 bond);
    event Withdrawn(address indexed to, uint256 amount);

    error BadVectors();
    error NotSpecOwner();
    error StatefulCircuit();
    error NotACPU();
    error NotCircuitOwner();
    error ClaimAlreadyOpen(uint256 claimId);
    error ShapeMismatch();
    error WrongMiter();
    error MiterShape();
    error TooManyGates(uint256 gateCount);
    error BondTooLarge();
    error LockTooShort();
    error NotOpen();
    error UnknownClaim();
    error NoCommitment();
    error RevealTooEarly();
    error NonCanonicalInput();
    error NotACounterexample();
    error NotClaimant();
    error StillLocked();
    error NoBond();
    error NothingToWithdraw();
    error TransferFailed();

    constructor(
        address factory_,
        address tapebookCircuits,
        uint256[] memory specIds,
        bytes[] memory ins,
        bytes[] memory outs
    ) {
        if (specIds.length != ins.length || ins.length != outs.length || specIds.length > MAX_VECTORS) {
            revert BadVectors();
        }
        factory = ITapeOutFactory(factory_);
        tapebook = ICPU(tapebookCircuits);
        circuitBeacon = ITapeOutFactory(factory_).circuitBeacon();
        for (uint256 i = 0; i < specIds.length; ++i) {
            _vecSpecIds.push(specIds[i]);
            _vecIns.push(ins[i]);
            _vecOuts.push(outs[i]);
        }
    }

    // ------------------------------------------------------------------ specs

    /// @notice Label a spec circuit on the Tapebook processor. Owner of that circuit only;
    ///         may be called again to update name and uri.
    function registerSpec(uint256 specId, string calldata name, string calldata uri) external {
        if (IERC721(address(tapebook)).ownerOf(specId) != msg.sender) revert NotSpecOwner();
        (,, uint32 nState,) = tapebook.circuitInfo(specId);
        if (nState != 0) revert StatefulCircuit();
        specs[specId] = SpecInfo(msg.sender, name, uri);
        emit SpecRegistered(specId, msg.sender, name, uri);
    }

    // ------------------------------------------------------------------ claims

    /// @notice Post a claim that (cpu, id) behaves exactly like spec `specId` on every input.
    /// @param miterId the miter circuit, already taped out on the Tapebook processor with
    ///        the netlist MiterLib.build(tapebook, cpu, id, specId, nIn, nOut).
    /// @param lockSeconds how long the bond cannot be reclaimed; at least MIN_LOCK when bonded.
    function post(address cpu, uint256 id, uint256 specId, uint256 miterId, uint64 lockSeconds)
        external
        payable
        nonReentrant
        returns (uint256 claimId)
    {
        if (!factory.isCPU(cpu)) revert NotACPU();
        if (IERC721(cpu).ownerOf(id) != msg.sender) revert NotCircuitOwner();
        bytes32 key = keccak256(abi.encode(cpu, id, specId));
        if (openClaimOf[key] != 0) revert ClaimAlreadyOpen(openClaimOf[key]);

        uint32 nIn;
        uint32 nOut;
        {
            (uint32 tIn, uint32 tOut, uint32 tState,) = ICPU(cpu).circuitInfo(id);
            (uint32 sIn, uint32 sOut, uint32 sState,) = tapebook.circuitInfo(specId);
            if (tState != 0 || sState != 0) revert StatefulCircuit();
            if (tIn != sIn || tOut != sOut || tIn > MiterLib.MAX_PINS || tOut > MiterLib.MAX_PINS) {
                revert ShapeMismatch();
            }
            nIn = tIn;
            nOut = tOut;
        }

        if (keccak256(tapebook.netlist(miterId)) != keccak256(MiterLib.build(address(tapebook), cpu, id, specId, nIn, nOut))) {
            revert WrongMiter();
        }
        {
            (uint32 mIn, uint32 mOut, uint32 mState, uint32 g) = tapebook.circuitInfo(miterId);
            if (mIn != nIn || mOut != 1 || mState != 0) revert MiterShape();
            if (g > MAX_GATES) revert TooManyGates(g);
        }

        if (msg.value > MAX_BOND) revert BondTooLarge();
        if (msg.value > 0 && lockSeconds < MIN_LOCK) revert LockTooShort();

        claimId = ++claimCount;
        openClaimOf[key] = claimId;
        Claim storage c = claims[claimId];
        c.cpu = cpu;
        c.id = id;
        c.specId = specId;
        c.miterId = miterId;
        c.claimant = msg.sender;
        c.bond = uint96(msg.value);
        c.postedAt = uint64(block.timestamp);
        c.lockUntil = uint64(block.timestamp) + lockSeconds;
        c.status = Status.Open;
        c.targetHash = keccak256(ICPU(cpu).netlist(id));
        c.nIn = nIn;
        c.circuitImpl = currentImpl();

        emit Posted(claimId, cpu, id, specId, miterId, msg.sender, msg.value, c.lockUntil, c.circuitImpl);
    }

    /// @notice Record a commitment h = keccak256(abi.encode(claimId, x, msg.sender)).
    ///         Never reverts; a repeated hash keeps its earliest block, so copying someone
    ///         else's commitment neither blocks them nor helps the copier.
    function commit(bytes32 h) external {
        if (commitBlock[h] == 0) {
            commitBlock[h] = uint64(block.number);
            emit Committed(h, msg.sender);
        }
    }

    /// @notice Break an Open claim with counterexample `x`, committed at least REVEAL_DELAY blocks ago.
    function challenge(uint256 claimId, bytes calldata x) external nonReentrant {
        Claim storage c = claims[claimId];
        if (c.status != Status.Open) revert NotOpen();
        uint64 cb = commitBlock[keccak256(abi.encode(claimId, x, msg.sender))];
        if (cb == 0) revert NoCommitment();
        if (block.number < uint256(cb) + REVEAL_DELAY) revert RevealTooEarly();
        if (!_differs(c, x)) revert NotACounterexample();

        uint256 paid = c.bond;
        c.status = Status.Broken;
        c.bond = 0;
        c.breaker = msg.sender;
        c.counterexample = x;
        delete openClaimOf[keccak256(abi.encode(c.cpu, c.id, c.specId))];
        credit[msg.sender] += paid;

        emit Broken(claimId, msg.sender, x, paid, currentImpl());
    }

    /// @notice Add to the bond of an Open claim. Claimant only; total stays at most MAX_BOND.
    function topUp(uint256 claimId) external payable nonReentrant {
        Claim storage c = claims[claimId];
        if (c.claimant != msg.sender) revert NotClaimant();
        if (c.status != Status.Open) revert NotOpen();
        uint256 total = uint256(c.bond) + msg.value;
        if (total > MAX_BOND) revert BondTooLarge();
        c.bond = uint96(total);
        emit BondChanged(claimId, total);
    }

    /// @notice Move the bond of an Open claim to the claimant's credit, once the lock has ended
    ///         or TapeOut's circuit logic has changed since posting. The claim stays Open.
    function reclaimBond(uint256 claimId) external nonReentrant {
        Claim storage c = claims[claimId];
        if (c.claimant != msg.sender) revert NotClaimant();
        if (c.status != Status.Open) revert NotOpen();
        if (block.timestamp < c.lockUntil && currentImpl() == c.circuitImpl) revert StillLocked();
        uint256 amt = c.bond;
        if (amt == 0) revert NoBond();
        c.bond = 0;
        credit[msg.sender] += amt;
        emit BondChanged(claimId, 0);
    }

    function withdraw() external nonReentrant {
        uint256 amt = credit[msg.sender];
        if (amt == 0) revert NothingToWithdraw();
        credit[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amt}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amt);
    }

    // ------------------------------------------------------------------ views

    /// @notice True when the target and the spec disagree on `x` (the miter returns 1).
    ///         Same canonical check and miter eval as `challenge`; no state change.
    function differs(uint256 claimId, bytes calldata x) external view returns (bool) {
        Claim storage c = claims[claimId];
        if (c.status == Status.None) revert UnknownClaim();
        return _differs(c, x);
    }

    function currentImpl() public view returns (address) {
        return IBeacon(circuitBeacon).implementation();
    }

    /// @notice Evaluates the seed specs on the vectors stored at deploy. A revert counts as false.
    function conformance() external view returns (bool[] memory ok) {
        uint256 n = _vecSpecIds.length;
        ok = new bool[](n);
        for (uint256 i = 0; i < n; ++i) {
            try tapebook.eval(_vecSpecIds[i], _vecIns[i]) returns (bytes memory out) {
                ok[i] = keccak256(out) == keccak256(_vecOuts[i]);
            } catch {
                ok[i] = false;
            }
        }
    }

    function conformanceCount() external view returns (uint256) {
        return _vecSpecIds.length;
    }

    function conformanceVector(uint256 i) external view returns (uint256 specId, bytes memory input, bytes memory output) {
        return (_vecSpecIds[i], _vecIns[i], _vecOuts[i]);
    }

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        return claims[claimId];
    }

    function claimKey(address cpu, uint256 id, uint256 specId) external pure returns (bytes32) {
        return keccak256(abi.encode(cpu, id, specId));
    }

    function commitment(uint256 claimId, bytes calldata x, address sender) external pure returns (bytes32) {
        return keccak256(abi.encode(claimId, x, sender));
    }

    // ------------------------------------------------------------------ internal

    function _differs(Claim storage c, bytes calldata x) private view returns (bool) {
        uint256 nIn = c.nIn;
        if (x.length != (nIn + 7) / 8) revert NonCanonicalInput();
        uint256 rem = nIn & 7;
        if (rem != 0 && (uint8(x[x.length - 1]) >> rem) != 0) revert NonCanonicalInput();
        bytes memory out = tapebook.eval(c.miterId, x);
        return (uint8(out[0]) & 1) == 1;
    }
}
