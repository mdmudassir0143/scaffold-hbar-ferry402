// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Escrow} from "../contracts/Escrow.sol";

/// Deploys your own Escrow on Base Sepolia, bound to an EIP-3009 token
/// (Circle USDC by default). The template works without this -- it settles
/// into the shared, already-deployed Escrow -- so run it only once you want
/// an escrow you control. Put the printed address in packages/api/.env as
/// ESCROW_ADDRESS_BASE_SEPOLIA.
contract DeployEscrow is Script {
    address internal constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external returns (Escrow escrow) {
        address token = vm.envOr("USDC_ADDRESS_BASE_SEPOLIA", BASE_SEPOLIA_USDC);
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        escrow = new Escrow(token);
        vm.stopBroadcast();
        console.log("Escrow deployed at", address(escrow));
        console.log("token", token);
    }
}
