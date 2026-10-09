// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MiterLib — the Tapebook miter netlist, byte-identical to core/miter.ts.
/// @notice For target T = (cpu, id) and spec S = (tapebook, specId) with equal pin counts:
///
///           x[k] = 2+k                                 (k < nIn)
///           REF T (ins = x)  → t[i] = 2+nIn+i
///           REF S (ins = x)  → s[i] = 2+nIn+nOut+i
///           d[i] = XOR(t[i], s[i])                     4 NAND each, in index order
///           acc = d[0]; acc = OR(acc, d[i])            3 NAND each
///
///         The last signal is acc, so the miter taped out with nOut = 1 returns 1 exactly on
///         inputs where target and spec disagree. NAND burned = 4·nOut + 3·(nOut − 1).
library MiterLib {
    uint8 internal constant OP_NAND = 0x00;
    uint8 internal constant OP_REF = 0x02;
    uint256 internal constant MAX_PINS = 255;

    error PinsOutOfRange(uint256 nIn, uint256 nOut);
    error IdOutOfRange(uint256 id);

    function nandCount(uint256 nOut) internal pure returns (uint256) {
        return 4 * nOut + 3 * (nOut - 1);
    }

    function size(uint256 nIn, uint256 nOut) internal pure returns (uint256) {
        return 2 * (31 + 3 * nIn) + 7 * nandCount(nOut);
    }

    function build(address tapebook, address cpu, uint256 id, uint256 specId, uint256 nIn, uint256 nOut)
        internal
        pure
        returns (bytes memory nl)
    {
        if (nIn > MAX_PINS || nOut == 0 || nOut > MAX_PINS) revert PinsOutOfRange(nIn, nOut);
        if (id > type(uint64).max) revert IdOutOfRange(id);
        if (specId > type(uint64).max) revert IdOutOfRange(specId);

        nl = new bytes(size(nIn, nOut));
        uint256 w;
        assembly {
            w := add(nl, 32)
        }
        w = _ref(w, cpu, id, nIn, nOut);
        w = _ref(w, tapebook, specId, nIn, nOut);

        uint256 tBase = 2 + nIn;
        uint256 sBase = tBase + nOut;
        uint256 dBase = sBase + nOut; // first XOR's n1
        // XOR(t[i], s[i]) as 4 NAND; d[i] = dBase + 4i + 3.
        for (uint256 i = 0; i < nOut; ++i) {
            uint256 t = tBase + i;
            uint256 s = sBase + i;
            uint256 n1 = dBase + 4 * i;
            w = _nand(w, t, s);
            w = _nand(w, t, n1);
            w = _nand(w, s, n1);
            w = _nand(w, n1 + 1, n1 + 2);
        }
        // OR fold: p = NAND(acc,acc), q = NAND(d,d), acc = NAND(p,q).
        uint256 acc = dBase + 3;
        uint256 next = dBase + 4 * nOut;
        for (uint256 i = 1; i < nOut; ++i) {
            uint256 d = dBase + 4 * i + 3;
            w = _nand(w, acc, acc);
            w = _nand(w, d, d);
            w = _nand(w, next, next + 1);
            acc = next + 2;
            next += 3;
        }
    }

    /// @dev REF op, cpu:address, circuitId:u64, rIn:u8, rOut:u8, ins:u24[rIn] with ins = x[0..nIn-1].
    function _ref(uint256 w, address cpu, uint256 cid, uint256 nIn, uint256 nOut) private pure returns (uint256) {
        assembly {
            mstore8(w, OP_REF)
            w := add(w, 1)
            // 20-byte address, big-endian
            mstore(w, shl(96, cpu))
            w := add(w, 20)
            // 8-byte circuit id, big-endian
            mstore(w, shl(192, cid))
            w := add(w, 8)
            mstore8(w, nIn)
            mstore8(add(w, 1), nOut)
            w := add(w, 2)
        }
        for (uint256 k = 0; k < nIn; ++k) {
            w = _u24(w, 2 + k);
        }
        return w;
    }

    function _nand(uint256 w, uint256 a, uint256 b) private pure returns (uint256) {
        assembly {
            mstore8(w, OP_NAND)
        }
        w = _u24(w + 1, a);
        return _u24(w, b);
    }

    function _u24(uint256 w, uint256 v) private pure returns (uint256) {
        assembly {
            mstore8(w, and(shr(16, v), 0xff))
            mstore8(add(w, 1), and(shr(8, v), 0xff))
            mstore8(add(w, 2), and(v, 0xff))
        }
        return w + 3;
    }
}
