// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {Path} from "src/dex/lfj/types/ILBRouterTypes.sol";

struct LiquidityBookSwapParameters {
    address routerAddress;
    Path path;
}
