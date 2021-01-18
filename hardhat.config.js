require('@nomiclabs/hardhat-waffle')
require('@nomiclabs/hardhat-web3')
require('@nomiclabs/hardhat-truffle5')

task('accounts', 'Prints the list of accounts', async () => {
  const accounts = await ethers.getSigners()
  for (const account of accounts) {
    console.log(account.address)
  }
})

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
    hardhat: {
      forking: {
        url: 'https://eth-mainnet.alchemyapi.io/v2/<>',
        blockNumber: 11679973,
      },
    },
    local: {
      url: 'http://127.0.0.1:8545',
    },
  },
  solidity: {
    version: '0.6.12',
  },
  mocha: {
    timeout: 200000,
  },
}
