// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Test-only contracts. Not deployed to X Layer.

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ICPU} from "../tapeout/interfaces/ICPU.sol";
import {MiterLib} from "../MiterLib.sol";

/// @dev Makes ERC1967Proxy available to tests (the factory is UUPS behind an ERC-1967 proxy).
contract TestProxy is ERC1967Proxy {
    constructor(address impl, bytes memory data) ERC1967Proxy(impl, data) {}
}

/// @dev Exposes MiterLib.build for the byte-identity test.
contract MiterHarness {
    function build(address tapebook, address cpu, uint256 id, uint256 specId, uint256 nIn, uint256 nOut)
        external
        pure
        returns (bytes memory)
    {
        return MiterLib.build(tapebook, cpu, id, specId, nIn, nOut);
    }
}

/// @dev Runs TapeOut's own eval over a contiguous range of integer inputs in one eth_call and
///      returns the first output byte of each, so exhaustive checks avoid one RPC round trip
///      per input. Input x is packed little-endian into ceil(nIn/8) bytes, pin i = bit i of x.
contract EvalSweep {
    function sweep(address cpu, uint256 id, uint256 nIn, uint256 from, uint256 count)
        external
        view
        returns (bytes memory firstBytes)
    {
        uint256 nb = (nIn + 7) / 8;
        firstBytes = new bytes(count);
        bytes memory x = new bytes(nb);
        for (uint256 k = 0; k < count; ++k) {
            uint256 v = from + k;
            for (uint256 j = 0; j < nb; ++j) x[j] = bytes1(uint8(v >> (8 * j)));
            bytes memory out = ICPU(cpu).eval(id, x);
            firstBytes[k] = out[0];
        }
    }

    /// @dev Same, but returns the whole output of each eval concatenated (fixed width `outBytes`).
    function sweepFull(address cpu, uint256 id, uint256 nIn, uint256 outBytes, uint256 from, uint256 count)
        external
        view
        returns (bytes memory outs)
    {
        uint256 nb = (nIn + 7) / 8;
        outs = new bytes(count * outBytes);
        bytes memory x = new bytes(nb);
        for (uint256 k = 0; k < count; ++k) {
            uint256 v = from + k;
            for (uint256 j = 0; j < nb; ++j) x[j] = bytes1(uint8(v >> (8 * j)));
            bytes memory out = ICPU(cpu).eval(id, x);
            for (uint256 j = 0; j < outBytes; ++j) outs[k * outBytes + j] = out[j];
        }
    }
}

/// @dev Receiver that tries to re-enter TapebookClaims.withdraw from its receive hook.
interface IClaimsWithdraw {
    function withdraw() external;
    function commit(bytes32 h) external;
    function challenge(uint256 claimId, bytes calldata x) external;
}

contract ReentrantReceiver {
    IClaimsWithdraw public immutable claims;
    uint256 public reentries;
    bool public reentrySucceeded;

    constructor(address claims_) {
        claims = IClaimsWithdraw(claims_);
    }

    function commit(bytes32 h) external {
        claims.commit(h);
    }

    function challenge(uint256 claimId, bytes calldata x) external {
        claims.challenge(claimId, x);
    }

    function withdraw() external {
        claims.withdraw();
    }

    receive() external payable {
        reentries += 1;
        try claims.withdraw() {
            reentrySucceeded = true;
        } catch {}
    }
}
