// ABIs: TapeOut and TapebookClaims from the compiled contracts package, Multicall3 from viem.
export {
  tapebookClaimsAbi,
  circuitFactoryAbi,
  circuitsAbi,
  transistorsAbi,
  upgradeableBeaconAbi,
} from '../../contracts/abi';
export { multicall3Abi } from 'viem';

/** ERC-1967 implementation slot: bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1). */
export const ERC1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as const;
