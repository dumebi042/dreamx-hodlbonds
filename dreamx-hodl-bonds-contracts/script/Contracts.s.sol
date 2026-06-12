// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {Version} from "src/dex/lfj/types/ILBRouterTypes.sol";
import {ApprovedPair} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Path} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";
import {Route} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";

library Contracts {
    uint256 constant AVALANCHE_MAINNET_CHAIN_ID = 43114;
    uint256 constant AVALANCHE_FUJI_CHAIN_ID = 43113;
    uint256 constant SEPOLIA_CHAIN_ID = 11155111;
    uint256 constant BASE_TESTNET_CHAIN_ID = 10143;

    function getVaultFactoryAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return 0x769c0512c91F205D916e85867BE83B9ab889a4Ec;
        } else if (chainId == SEPOLIA_CHAIN_ID) {
            return 0xF684cBc05CFBE076a8E3Bd58B67CEeaEaE3b682C;
        } else if (chainId == BASE_TESTNET_CHAIN_ID) {
            return 0x88E4c7C80b55f450518364287CFbDD8F7019a0Bc;
        }
        revert("Unsupported chainId");
    }

    function getWrappedNativeTokenAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return 0xd00ae08403B9bbb9124bB305C09058E32C39A48c; // WAVAX
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7; // WAVAX
        }

        revert("Unsupported chainId");
    }

    function getBlackholeTestnetWrappedNativeTokenAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return 0x892E501ccbfB204D8102A44d853C27c2Db78bdDe; // WETH
        }

        revert("Unsupported chainId");
    }

    function getNativeTokenAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0);
        } else if (chainId == SEPOLIA_CHAIN_ID) {
            return address(0);
        } else if (chainId == BASE_TESTNET_CHAIN_ID) {
            return address(0);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0);
        }

        revert("Unsupported chainId");
    }

    function getUSDCAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x65ede7E6a4a713c18aFb580022c59930a4752f3A);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E); // USDC.e
        }

        revert("Unsupported chainId");
    }

    function getETHAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0xDF5C8745de544e7C6501AF3d75Dc4B0932D00F39);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB); // WETH.e
        }

        revert("Unsupported chainId");
    }

    function getBTCAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x999C7181a00A90d66839Abd8A1D47E551a6Caf50);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0x152b9d0FdC40C096757F570A51E494bd4b943E50); // BTC.b
        }

        revert("Unsupported chainId");
    }

    function getPaymentSplitterAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return 0x1494214aB7aAD2b02a9A8888bf0F8ca8905C6197;
        } else if (chainId == SEPOLIA_CHAIN_ID) {
            return 0x2D4628a6a32a2A78053c9DF45c0537dA37b79849;
        } else if (chainId == BASE_TESTNET_CHAIN_ID) {
            return 0x2D4628a6a32a2A78053c9DF45c0537dA37b79849;
        }

        revert("Unsupported chainId");
    }

    function getUniV4RouterAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0);
        } else if (chainId == SEPOLIA_CHAIN_ID) {
            return 0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b;
        } else if (chainId == BASE_TESTNET_CHAIN_ID) {
            return 0x492E6456D9528771018DeB9E87ef7750EF184104;
        }

        revert("Unsupported chainId");
    }

    function getUniV4PositionManagerAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0);
        } else if (chainId == SEPOLIA_CHAIN_ID) {
            return 0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4;
        } else if (chainId == BASE_TESTNET_CHAIN_ID) {
            return 0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80;
        }

        revert("Unsupported chainId");
    }

    function getPermit2Address(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0);
        } else if (chainId == SEPOLIA_CHAIN_ID) {
            return 0x000000000022D473030F116dDEE9F6B43aC78BA3;
        } else if (chainId == BASE_TESTNET_CHAIN_ID) {
            return 0x000000000022D473030F116dDEE9F6B43aC78BA3;
        }

        revert("Unsupported chainId");
    }

    function getUniV4PoolId(uint256 chainId) internal pure returns (bytes32) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return bytes32(0);
        } else if (chainId == SEPOLIA_CHAIN_ID) {
            return 0x11b968cfdfdab936ed1323d92596d39237265d4f3cebf142261f1ce1bc710d65;
        } else if (chainId == BASE_TESTNET_CHAIN_ID) {
            return bytes32(0);
        }
        revert("Unsupported chainId");
    }

    function getLBHooksLens(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x6124086B90AB910038E607aa1BDD67b284C31c98);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0x6124086B90AB910038E607aa1BDD67b284C31c98);
        }

        revert("Unsupported chainId");
    }

    function getLiquidityHelperContract(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0xA5c68C9E55Dde3505e60c4B5eAe411e2977dfB35);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0xA5c68C9E55Dde3505e60c4B5eAe411e2977dfB35);
        }

        revert("Unsupported chainId");
    }

    function getLBFactoryV22(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c);
        }

        revert("Unsupported chainId");
    }

    function getLBRouterV22(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x18556DA13313f3532c54711497A8FedAC273220E);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0x18556DA13313f3532c54711497A8FedAC273220E);
        }

        revert("Unsupported chainId");
    }

    function getLBQuoterV22(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x9A550a522BBaDFB69019b0432800Ed17855A51C3);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0x9A550a522BBaDFB69019b0432800Ed17855A51C3);
        }

        revert("Unsupported chainId");
    }

    function getLB_AVAX_USDC_Address(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x0E7dca6d5cc3Ad4d8831c2871F5151C1aA375dBe);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0x864d4e5Ee7318e97483DB7EB0912E09F161516EA);
        }
        revert("Unsupported chainId");
    }

    function getLB_BTC_USDC_Address(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x2DF3be283D98B8ce565353C7415Ef1D01f62BFa1);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0x4224f6F4C9280509724Db2DbAc314621e4465C29);
        }
        revert("Unsupported chainId");
    }

    function getLB_WETH_AVAX_Address(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x9219199164Bab347Ca3C0466Ae6DA01d0fb2dF64);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0x1901011a39B11271578a1283D620373aBeD66faA);
        }
        revert("Unsupported chainId");
    }

    function getLBHooksManagerV22(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x3A8E1Be95467690F7C592B596e42d11b3710c633);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0x3A8E1Be95467690F7C592B596e42d11b3710c633);
        }
        revert("Unsupported chainId");
    }

    function getLBVersion(uint256 chainId) internal pure returns (Version) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return Version.V2_2;
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return Version.V2_2;
        }

        revert("Unsupported chainId or tokenAddress");
    }

    function get_AVAX_USDC_ChainLinkPriceOracleAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x5498BB86BC934c8D34FDA08E81D444153d0D06aD); // AVAX/USD Price Feed
        } else if (chainId == SEPOLIA_CHAIN_ID) {
            return address(0x694AA1769357215DE4FAC081bf1f309aDC325306); // ETH/USD Price Feed
        } else if (chainId == BASE_TESTNET_CHAIN_ID) {
            return address(0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1); // ETH/USD Price Feed
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0x0A77230d17318075983913bC2145DB16C7366156); // AVAX/USD Price Feed
        }

        revert("Unsupported chainId");
    }

    function get_BTC_USDC_ChainLinkPriceOracleAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x31CF013A08c6Ac228C94551d535d5BAfE19c602a); // BTC/USD Price Feed
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0x50b7545627a5162F82A992c33b87aDc75187B218); // BTC/USD Price Feed
        }

        revert("Unsupported chainId");
    }

    function getBlackhole_AVAX_USDC_Address(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0xFa96687cd78cdB4195863542193450f84bd1212F);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0xA02Ec3Ba8d17887567672b2CDCAF525534636Ea0);
        }

        revert("Unsupported chainId");
    }

    function getBlackhole_BTC_AVAX_Address(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x8FEF4fE4970a5D6bFa7C65871a2EbFD0F42aa822);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0x8FEF4fE4970a5D6bFa7C65871a2EbFD0F42aa822);
        }

        revert("Unsupported chainId");
    }

    function getBlackhole_BTC_USDC_Address(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x23fF0B5370BF33725918e6105108f3fa2c4b8a05);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0x23fF0B5370BF33725918e6105108f3fa2c4b8a05);
        }

        revert("Unsupported chainId");
    }

    function getBlackholeRouterV2Address(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x1B6814F3227a246F62bC47b148b3d288Dbc85715);
        } else if (chainId == AVALANCHE_MAINNET_CHAIN_ID) {
            return address(0x04E1dee021Cd12bBa022A72806441B43d8212Fec);
        }

        revert("Unsupported chainId");
    }

    function get_Native_USDC_Pair(
        uint256 _chainId,
        uint256[] memory _pairBinSteps
    ) internal pure returns (ApprovedPair memory) {
        if (_chainId == AVALANCHE_FUJI_CHAIN_ID) {
            address wrappedNativeTokenAddress = Contracts.getWrappedNativeTokenAddress(_chainId);
            address stableTokenAddress = Contracts.getUSDCAddress(_chainId);
            address blackholeTokenPairAddress = Contracts.getBlackhole_AVAX_USDC_Address(_chainId);

            IERC20[] memory tokenPath = new IERC20[](2);

            tokenPath[0] = IERC20(wrappedNativeTokenAddress); // input token
            tokenPath[1] = IERC20(stableTokenAddress); // output token

            Version[] memory versions = new Version[](1);
            versions[0] = Contracts.getLBVersion(_chainId); // add the version of the pair to perform the swap on

            Path memory path; // instantiate and populate the path to perform the swap.
            path.pairBinSteps = _pairBinSteps;
            path.versions = versions;
            path.tokenPath = tokenPath;

            Route[] memory routes = new Route[](1);
            routes[0] = Route({
                pair: address(blackholeTokenPairAddress),
                from: address(wrappedNativeTokenAddress),
                to: address(stableTokenAddress),
                stable: false,
                concentrated: true,
                receiver: address(0) // the final receiver will be set to the correct value in the swap function of the vault
            });

            ApprovedPair memory approvedPair = ApprovedPair({
                stableTokenAddress: Contracts.getUSDCAddress(_chainId),
                vaultTokenAddress: address(0),
                wrappedNativeTokenAddress: Contracts.getWrappedNativeTokenAddress(_chainId),
                routerAddress: Contracts.getLBRouterV22(_chainId),
                swapPath: path,
                routerV2Address: Contracts.getBlackholeRouterV2Address(_chainId),
                swapRoutes: routes,
                chainlinkPriceOracleAddress: Contracts.get_AVAX_USDC_ChainLinkPriceOracleAddress(_chainId),
                maxPriceAge: 21_600
            });

            return approvedPair;
        }

        revert("Unsupported chainId");
    }

    function getMarketplaceAddress(uint256 chainId) internal pure returns (address) {
        if (chainId == AVALANCHE_FUJI_CHAIN_ID) {
            return address(0x7C7f36239167d4e52FAB0A2984193815C9fb130e);
        }

        revert("Unsupported chainId");
    }
}
