import { subtask, type HardhatUserConfig } from 'hardhat/config';
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from 'hardhat/builtin-tasks/task-names';
import '@nomicfoundation/hardhat-toolbox-viem';

// Hardhat downloads solc from binaries.soliditylang.org. Where that host is unreachable,
// fall back to the same compiler release from npm (solc@0.8.24, soljson.js). Same version,
// same bytecode, so explorer verification is unaffected.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: { solcVersion: string }, _hre, runSuper) => {
  try {
    return await runSuper(args);
  } catch (err) {
    const solc = require('solc');
    const longVersion: string = solc.version().replace(/\.Emscripten\.clang$/, '');
    if (!longVersion.startsWith(`${args.solcVersion}+`)) throw err;
    console.warn(`solc download failed; using npm solc ${longVersion} (soljson.js)`);
    return { compilerPath: require.resolve('solc/soljson.js'), isSolcJs: true, version: args.solcVersion, longVersion };
  }
});

// Hardhat 2 (npm dist-tag hh2). X Layer's verification guide is written for this config shape.
const accounts = process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.24',
        settings: {
          evmVersion: 'cancun',
          optimizer: { enabled: true, runs: 200 },
        },
      },
    ],
    // The vendored TapeOut source (Transistors.initialize takes nine calldata arguments)
    // only compiles through the IR pipeline. It is compiled for local tests only;
    // Tapebook never deploys it.
    overrides: Object.fromEntries(
      ['tapeout/CircuitFactory', 'tapeout/Circuits', 'tapeout/Transistors', 'test/AlteredCircuits'].map((n) => [
        `contracts/${n}.sol`,
        { version: '0.8.24', settings: { evmVersion: 'cancun', viaIR: true, optimizer: { enabled: true, runs: 200 } } },
      ]),
    ),
  },
  networks: {
    hardhat: {
      // X Layer's EVM target. Also avoids the per-transaction gas cap of later hardforks, so
      // exhaustive eval sweeps can run as single eth_calls through a test harness.
      hardfork: 'cancun',
      blockGasLimit: 1_000_000_000,
    },
    localhost: {
      url: process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545',
    },
    xlayer: {
      url: process.env.XLAYER_RPC_URL || 'https://xlayerrpc.okx.com',
      chainId: 196,
      accounts,
    },
  },
  etherscan: {
    apiKey: { xlayer: process.env.OKLINK_API_KEY || '' },
    customChains: [
      {
        network: 'xlayer',
        chainId: 196,
        urls: {
          apiURL: 'https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER',
          browserURL: 'https://www.oklink.com/xlayer',
        },
      },
    ],
  },
  sourcify: { enabled: false },
  mocha: { timeout: 3_600_000 },
};

export default config;
