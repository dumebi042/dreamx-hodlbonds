// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Token with unlimited minting capabilities for testing purposes
// Not intended for production use
contract UnlimitedMintERC20 is ERC20 {
    uint8 private immutable DECIMALS;

    constructor(string memory _name, string memory _symbol, uint8 _decimals, uint256 _amount) ERC20(_name, _symbol) {
        DECIMALS = _decimals;
        _mint(msg.sender, _amount);
    }

    function decimals() public view override returns (uint8) {
        return DECIMALS;
    }

    function mint(address _to, uint256 _amount) public {
        _mint(_to, _amount);
    }
}
