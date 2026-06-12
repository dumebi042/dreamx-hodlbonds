// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {Path} from "src/dex/lfj/types/ILBRouterTypes.sol";
import {Route} from "src/dex/blackhole/types/BlackholeSwapTypes.sol";

enum Dex {
    LFJ,
    BLACKHOLE
}

// User configurable parameters when creating a dual token vault
struct UserConfigurableVaultParameters {
    uint256 bondPrice; // price of the vault token (the amount of varible token the contract takes per bond)
    uint256 maxStableTokenAmount; // maximum amount of stable token to pair with the variable token in the vault, will revert if exceeded at bond issuance time
    uint16 reserveRatio; // percentage of funds (in basis points) to take in stable token at start (need to validate against the upper/lower bounds)
    uint32 tradingPeriodDuration; // (AKA Tenure) duration of the trading period in seconds
    uint16 pairId; // token pair id, in order to associate TJ, Blackhole, and Chainlink pair info
    Dex primaryDex; // primary DEX to use for swaps (e.g., 0 = Trader Joe, 1 = Blackhole)
}

struct VaultParameters {
    uint64 vaultId; // unique id for the vault (determined by a counter on the factory)
    address vaultTokenAddress; // address of the "HODL token" for the vault (address(0) if native avax)
    address stableTokenAddress; // address of the stable token used in the vault
    address receiptTokenAddress; // address of the receipt token contract (ERC1155). Id is vaultId
    address chainlinkPriceOracleAddress; // address of the chainlink price oracle for the stable/vault token pair
    uint256 minUSDPricePerBond; // the minimum USD value of the variable token price of the bond, in the decimals of the stable token (e.g., if stable token is USDC with 6 decimals, and min price is $100, this value would be 100 * 10^6 = 100_000_000)
    address feeSplitterAddress; // address of the fee splitter contract
    uint16 managementFee; // management fee in basis points (e.g., 200 = 2%)
    uint16 performanceFee; // performance fee in basis points (e.g., 2000 = 20%)
    uint256 bondPrice; // price of the vault token (the amount of varible token the contract takes per bond)
    uint16 reserveRatio; // percentage of funds (in basis points) to take in stable token at start (need to validate against the upper/lower bounds)
    uint32 tradingPeriodDuration; // (AKA Tenure) duration of the trading period in seconds (need to validate against the upper/lower bounds)
    uint16 maxPriceAge; // maximum age of the price data from Chainlink oracles in seconds, after which the price is considered stale and bonds cannot be issued
    Dex primaryDex; // primary DEX to use for swaps (e.g., 0 = LFJ, 1 = Blackhole)
}

struct ApprovedPairWithId {
    uint256 pairId;
    ApprovedPair approvedPair;
}

struct ApprovedPair {
    address stableTokenAddress;
    address vaultTokenAddress;
    address wrappedNativeTokenAddress;
    // Trader Joe (Liquidity Book) swap parameters
    address routerAddress;
    Path swapPath;
    // Blackhole swap parameters
    address routerV2Address;
    Route[] swapRoutes;
    // Price oracle parameters
    address chainlinkPriceOracleAddress;
    uint16 maxPriceAge; // maximum age of the price data from Chainlink oracles in seconds, after which the price is considered stale and bonds cannot be issued
}

struct VaultCreationDataWithId {
    uint64 vaultId;
    VaultCreationData vaultCreationData;
}

struct VaultCreationData {
    address vaultAddress;
    UserConfigurableVaultParameters userConfig;
}
