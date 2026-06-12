import { clients, contractMap } from "@hodlbonds-api/blockchain"
import { env } from "@hodlbonds-api/env/trading-api"
// import { maxUint256 } from 'viem'
import { privateKeyToAccount } from "viem/accounts"
// import { tokenMap } from '@/blockchain/tokens'

const account = privateKeyToAccount(env.PRIVATE_KEY!)
const CHAIN_ID = 43113

const client = clients[CHAIN_ID]
const vaultFactory = contractMap.dualTokenVaultFactory.contract(CHAIN_ID)

/* Approve Stable Tokens to Contract */
// const vaultToken = tokenMap.vaultToken.contract(CHAIN_ID)
// const approveTxHash = await vaultToken.write.approve([vaultFactory.address, maxUint256], {
//   account,
//   chain: networks[CHAIN_ID],
// })
// console.log('Approve transaction hash:', approveTxHash)

// const approveTxReceipt = await client.waitForTransactionReceipt({ hash: approveTxHash })
// console.log('Transaction receipt:', { approveTxReceipt })

/* Create Dual Token Vault and Issue Bond */
const txHash = await vaultFactory.write.createVaultAndIssueBond(
  [
    {
      bondPrice: 100000000000n,
      maxStableTokenAmount: 1000000000000000000000000n,
      reserveRatio: 2000,
      tradingPeriodDuration: 8294400, // 96 days
      pairId: 1,
      primaryDex: 0,
    },
  ],
  { account, value: 102000000000n },
)
console.log("Transaction hash:", txHash)

const receipt = await client.waitForTransactionReceipt({ hash: txHash })
console.log("Transaction receipt:", { receipt })
