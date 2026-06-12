# HODL Bonds

This repository contains the contracts for HODL Bonds, alongside deployment-related scripts and unit tests. The addresses of current deployments can be found in [Contracts](./script/Contracts.s.sol).

- The core of HODL Bonds is the [DualTokenVault](./src/dualTokenVault/DualTokenVault.sol) contract, which handles issuance, redemption, and trading of tokens throughout the bond lifecycle.

- The [DualTokenVaultFactory](./src/dualTokenVaultFactory/DualTokenVaultFactory.sol) allows users to deploy custom vaults and tracks information about deployed vaults. Vault creation and bond issuance are atomic using the factory.

- The [VaultReceiptToken](./src/vaultReceiptToken/VaultReceiptToken) is an ERC1155 token that allows depositors to redeem their bond. The contract is deployed and managed by the factory contract, which also tracks receipt token collection ids.

## Build Instructions

Foundry documentation can be found [here](https://book.getfoundry.sh/forge/index.html).

Open your terminal and type in the following command:

```
curl -L https://foundry.paradigm.xyz | bash
```

This will download foundryup. Then install Foundry by running:

```
foundryup
```

To update foundry after installation, simply run `foundryup` again, and it will update to the latest Foundry release.
You can also revert to a specific version of Foundry with `foundryup -v $VERSION`.

## Install dependencies

To install dependencies, run the following to install dependencies:

```
forge install
```

## Building contracts

To build the contracts, run the following command:

```
forge build
```

## Tests

To run tests, run the following command:

```
forge test
```
