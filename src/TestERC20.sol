// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TestERC20
 * @dev ERC20 token with permit functionality for use with Hunch Bridge
 * This is a test token that can be used for bridge testing or as a bridgeable token
 */
contract TestERC20 is ERC20, ERC20Permit, Ownable {
    uint8 private _decimals;

    /**
     * @dev Constructor that mints initial supply to deployer
     * @param name Token name
     * @param symbol Token symbol
     * @param decimals Token decimals (default: 6 for USDC-like tokens)
     * @param initialSupply Initial supply to mint to deployer
     */
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 initialSupply
    ) ERC20(name, symbol) ERC20Permit(name) {
        _decimals = decimals;
        if (initialSupply > 0) {
            _mint(msg.sender, initialSupply);
        }
    }

    /**
     * @dev Returns the number of decimals used to get its user representation
     */
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @dev Mint tokens to a specific address (only owner)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev Burn tokens from caller's balance
     * @param amount Amount of tokens to burn
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /**
     * @dev Burn tokens from a specific address (only owner)
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burnFrom(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}

