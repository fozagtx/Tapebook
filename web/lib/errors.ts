// Turns a failed write or read into a readable reason, decoding the contracts' custom errors.
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem';

const HINTS: Record<string, string> = {
  NotACPU: 'the target is not a processor registered with the TapeOut factory',
  NotCircuitOwner: 'only the owner of the circuit can post a claim',
  ClaimAlreadyOpen: 'there is already an open claim for this circuit and spec',
  ShapeMismatch: 'target and spec must have the same input and output pin counts (at most 255 each)',
  StatefulCircuit: 'stateful circuits cannot be claimed',
  WrongMiter: 'the miter circuit does not have the expected netlist',
  MiterShape: 'the miter circuit has the wrong pin counts',
  TooManyGates: 'the miter exceeds 1,000 gates in total',
  BondTooLarge: 'bonds are capped at 1 OKB per claim',
  LockTooShort: 'a bonded claim must lock its bond for at least one day',
  NotOpen: 'the claim is not open',
  UnknownClaim: 'no such claim',
  NoCommitment: 'no commitment from this address for this claim and input',
  RevealTooEarly: 'wait one block after committing',
  NonCanonicalInput: 'the input has the wrong length or bits set above the last pin',
  NotACounterexample: 'target and spec agree on this input',
  NotClaimant: 'only the claimant can do this',
  StillLocked: 'the bond is still locked',
  NoBond: 'this claim has no bond',
  NothingToWithdraw: 'nothing to withdraw',
  TransferFailed: 'the transfer failed',
  NotSpecOwner: 'only the owner of the spec circuit can register it',
  BadVectors: 'bad conformance vectors',
};

export function reason(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return 'Rejected in wallet.';
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? revert.reason;
      if (name) return HINTS[name] ? `${name}: ${HINTS[name]}` : name;
    }
    return err.shortMessage || err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
