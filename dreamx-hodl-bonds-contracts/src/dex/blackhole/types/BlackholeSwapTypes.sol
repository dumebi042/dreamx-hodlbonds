// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

struct Route {
    address pair;
    address from;
    address to;
    bool stable;
    bool concentrated;
    address receiver;
}

struct BlackholeSwapParameters {
    address routerV2Address;
    Route[] routes;
}
