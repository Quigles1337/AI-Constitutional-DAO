/**
 * AI Constitution DAO Core - Native NAPI Module Loader
 *
 * This file handles loading the native module for the current platform.
 */

const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

const { platform, arch } = process;

let nativeBinding = null;
let localFileExisted = false;
let loadError = null;

function isMusl() {
  // For Linux, detect if this is a musl-based system (Alpine, etc.)
  if (platform !== 'linux') {
    return false;
  }

  try {
    // Check if /etc/alpine-release exists
    return existsSync('/etc/alpine-release');
  } catch {
    return false;
  }
}

switch (platform) {
  case 'android':
    switch (arch) {
      case 'arm64':
        localFileExisted = existsSync(join(__dirname, 'constitution-dao-core.android-arm64.node'));
        try {
          if (localFileExisted) {
            nativeBinding = require('./constitution-dao-core.android-arm64.node');
          } else {
            nativeBinding = require('@ai-constitution-dao/core-android-arm64');
          }
        } catch (e) {
          loadError = e;
        }
        break;
      case 'arm':
        localFileExisted = existsSync(join(__dirname, 'constitution-dao-core.android-arm-eabi.node'));
        try {
          if (localFileExisted) {
            nativeBinding = require('./constitution-dao-core.android-arm-eabi.node');
          } else {
            nativeBinding = require('@ai-constitution-dao/core-android-arm-eabi');
          }
        } catch (e) {
          loadError = e;
        }
        break;
      default:
        throw new Error(`Unsupported architecture on Android ${arch}`);
    }
    break;
  case 'win32':
    switch (arch) {
      case 'x64':
        localFileExisted = existsSync(join(__dirname, 'constitution-dao-core.win32-x64-msvc.node'));
        try {
          if (localFileExisted) {
            nativeBinding = require('./constitution-dao-core.win32-x64-msvc.node');
          } else {
            nativeBinding = require('@ai-constitution-dao/core-win32-x64-msvc');
          }
        } catch (e) {
          loadError = e;
        }
        break;
      case 'ia32':
        localFileExisted = existsSync(join(__dirname, 'constitution-dao-core.win32-ia32-msvc.node'));
        try {
          if (localFileExisted) {
            nativeBinding = require('./constitution-dao-core.win32-ia32-msvc.node');
          } else {
            nativeBinding = require('@ai-constitution-dao/core-win32-ia32-msvc');
          }
        } catch (e) {
          loadError = e;
        }
        break;
      case 'arm64':
        localFileExisted = existsSync(join(__dirname, 'constitution-dao-core.win32-arm64-msvc.node'));
        try {
          if (localFileExisted) {
            nativeBinding = require('./constitution-dao-core.win32-arm64-msvc.node');
          } else {
            nativeBinding = require('@ai-constitution-dao/core-win32-arm64-msvc');
          }
        } catch (e) {
          loadError = e;
        }
        break;
      default:
        throw new Error(`Unsupported architecture on Windows: ${arch}`);
    }
    break;
  case 'darwin':
    localFileExisted = existsSync(join(__dirname, 'constitution-dao-core.darwin-universal.node'));
    try {
      if (localFileExisted) {
        nativeBinding = require('./constitution-dao-core.darwin-universal.node');
      } else {
        nativeBinding = require('@ai-constitution-dao/core-darwin-universal');
      }
      break;
    } catch {}
    switch (arch) {
      case 'x64':
        localFileExisted = existsSync(join(__dirname, 'constitution-dao-core.darwin-x64.node'));
        try {
          if (localFileExisted) {
            nativeBinding = require('./constitution-dao-core.darwin-x64.node');
          } else {
            nativeBinding = require('@ai-constitution-dao/core-darwin-x64');
          }
        } catch (e) {
          loadError = e;
        }
        break;
      case 'arm64':
        localFileExisted = existsSync(join(__dirname, 'constitution-dao-core.darwin-arm64.node'));
        try {
          if (localFileExisted) {
            nativeBinding = require('./constitution-dao-core.darwin-arm64.node');
          } else {
            nativeBinding = require('@ai-constitution-dao/core-darwin-arm64');
          }
        } catch (e) {
          loadError = e;
        }
        break;
      default:
        throw new Error(`Unsupported architecture on macOS: ${arch}`);
    }
    break;
  case 'freebsd':
    if (arch !== 'x64') {
      throw new Error(`Unsupported architecture on FreeBSD: ${arch}`);
    }
    localFileExisted = existsSync(join(__dirname, 'constitution-dao-core.freebsd-x64.node'));
    try {
      if (localFileExisted) {
        nativeBinding = require('./constitution-dao-core.freebsd-x64.node');
      } else {
        nativeBinding = require('@ai-constitution-dao/core-freebsd-x64');
      }
    } catch (e) {
      loadError = e;
    }
    break;
  case 'linux':
    switch (arch) {
      case 'x64':
        if (isMusl()) {
          localFileExisted = existsSync(join(__dirname, 'constitution-dao-core.linux-x64-musl.node'));
          try {
            if (localFileExisted) {
              nativeBinding = require('./constitution-dao-core.linux-x64-musl.node');
            } else {
              nativeBinding = require('@ai-constitution-dao/core-linux-x64-musl');
            }
          } catch (e) {
            loadError = e;
          }
        } else {
          localFileExisted = existsSync(join(__dirname, 'constitution-dao-core.linux-x64-gnu.node'));
          try {
            if (localFileExisted) {
              nativeBinding = require('./constitution-dao-core.linux-x64-gnu.node');
            } else {
              nativeBinding = require('@ai-constitution-dao/core-linux-x64-gnu');
            }
          } catch (e) {
            loadError = e;
          }
        }
        break;
      case 'arm64':
        if (isMusl()) {
          localFileExisted = existsSync(join(__dirname, 'constitution-dao-core.linux-arm64-musl.node'));
          try {
            if (localFileExisted) {
              nativeBinding = require('./constitution-dao-core.linux-arm64-musl.node');
            } else {
              nativeBinding = require('@ai-constitution-dao/core-linux-arm64-musl');
            }
          } catch (e) {
            loadError = e;
          }
        } else {
          localFileExisted = existsSync(join(__dirname, 'constitution-dao-core.linux-arm64-gnu.node'));
          try {
            if (localFileExisted) {
              nativeBinding = require('./constitution-dao-core.linux-arm64-gnu.node');
            } else {
              nativeBinding = require('@ai-constitution-dao/core-linux-arm64-gnu');
            }
          } catch (e) {
            loadError = e;
          }
        }
        break;
      case 'arm':
        localFileExisted = existsSync(join(__dirname, 'constitution-dao-core.linux-arm-gnueabihf.node'));
        try {
          if (localFileExisted) {
            nativeBinding = require('./constitution-dao-core.linux-arm-gnueabihf.node');
          } else {
            nativeBinding = require('@ai-constitution-dao/core-linux-arm-gnueabihf');
          }
        } catch (e) {
          loadError = e;
        }
        break;
      default:
        throw new Error(`Unsupported architecture on Linux: ${arch}`);
    }
    break;
  default:
    throw new Error(`Unsupported OS: ${platform}, architecture: ${arch}`);
}

if (!nativeBinding) {
  if (loadError) {
    throw loadError;
  }
  throw new Error(`Failed to load native binding`);
}

const {
  verifyProposal,
  verifyProposalJson,
  canonicalizeProposal,
  computeComplexityScore,
  detectParadoxInText,
  detectCyclesInAst,
  calculateFriction,
  getMaxComplexity,
  getOracleBond,
  getActiveOracleSetSize,
  getJurySize,
  getJuryVotingPeriod,
} = nativeBinding;

module.exports = {
  verifyProposal,
  verifyProposalJson,
  canonicalizeProposal,
  computeComplexityScore,
  detectParadoxInText,
  detectCyclesInAst,
  calculateFriction,
  getMaxComplexity,
  getOracleBond,
  getActiveOracleSetSize,
  getJurySize,
  getJuryVotingPeriod,
};
