import { parseAbi } from "viem"

export const vaultFactoryAbi = parseAbi([
  "function createVault((uint256 bondPrice, address feeSplitterAddress, uint64 vaultId, uint32 reserveRatio, address vaultTokenAddress, uint64 bondSaleStart, uint32 fundingPeriodDuration, address stableTokenAddress, uint64 bondSaleEnd, uint32 tradingPeriodDuration, address receiptTokenAddress, uint64 bondLimit, uint32 hurdleRate, address affiliateAddress, uint8 tradingStrategy, uint16 managementFee, uint16 performanceFee, address chainlinkPriceOracleAddress) _vaultParams, (address routerAddress, address tokenPairAddress, uint8 version) _lbParams, (address routerV2Address, address pairAddress, bool concentrated) _bhParams, address _wrappedNativeTokenAddress) returns (address)",
  "function getActiveVaults() view returns ((address vaultImplementation, (uint256 bondPrice, address feeSplitterAddress, uint64 vaultId, uint32 reserveRatio, address vaultTokenAddress, uint64 bondSaleStart, uint32 fundingPeriodDuration, address stableTokenAddress, uint64 bondSaleEnd, uint32 tradingPeriodDuration, address receiptTokenAddress, uint64 bondLimit, uint32 hurdleRate, address affiliateAddress, uint8 tradingStrategy, uint16 managementFee, uint16 performanceFee, address chainlinkPriceOracleAddress) creationData)[])",
  "function getVault(uint256 vaultId) view returns ((address vaultImplementation, (uint256 bondPrice, address feeSplitterAddress, uint64 vaultId, uint32 reserveRatio, address vaultTokenAddress, uint64 bondSaleStart, uint32 fundingPeriodDuration, address stableTokenAddress, uint64 bondSaleEnd, uint32 tradingPeriodDuration, address receiptTokenAddress, uint64 bondLimit, uint32 hurdleRate, address affiliateAddress, uint8 tradingStrategy, uint16 managementFee, uint16 performanceFee, address chainlinkPriceOracleAddress) creationData))",
  "function getVaultTokenBalance(address _vaultAddress) view returns ((uint256 vaultTokenBalance, uint256 vaultTokenDecimals, uint256 stableTokenBalance, uint256 stableTokenDecimals))",
  "function getVaults() view returns ((address vaultImplementation, (uint256 bondPrice, address feeSplitterAddress, uint64 vaultId, uint32 reserveRatio, address vaultTokenAddress, uint64 bondSaleStart, uint32 fundingPeriodDuration, address stableTokenAddress, uint64 bondSaleEnd, uint32 tradingPeriodDuration, address receiptTokenAddress, uint64 bondLimit, uint32 hurdleRate, address affiliateAddress, uint8 tradingStrategy, uint16 managementFee, uint16 performanceFee, address chainlinkPriceOracleAddress) creationData)[])",
  "function grantTraderRoleForVault(uint256 _vaultId, address _address)",
  "function nextVaultId() view returns (uint64)",
  "function receiptTokenAddress() view returns (address)",
  "function revokeTraderRoleForVault(uint256 _vaultId, address _address)",
  "function vaultImplementationAddress() view returns (address)",
  "function vaults(uint256) view returns (address vaultImplementation, (uint256 bondPrice, address feeSplitterAddress, uint64 vaultId, uint32 reserveRatio, address vaultTokenAddress, uint64 bondSaleStart, uint32 fundingPeriodDuration, address stableTokenAddress, uint64 bondSaleEnd, uint32 tradingPeriodDuration, address receiptTokenAddress, uint64 bondLimit, uint32 hurdleRate, address affiliateAddress, uint8 tradingStrategy, uint16 managementFee, uint16 performanceFee, address chainlinkPriceOracleAddress) creationData)",
  "event VaultCreated(address indexed creator, uint256 indexed vaultId, address vaultAddress)",
  "event VaultVersionAdded(uint256 indexed version, bytes32 bytecodeHash)",
  "error AccessControlBadConfirmation()",
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
  "error FailedDeployment()",
  "error InsufficientBalance(uint256 balance, uint256 needed)",
  "error VaultDeployerAlreadyDeployed()",
])
