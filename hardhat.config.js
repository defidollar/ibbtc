require('@nomiclabs/hardhat-waffle')
require('@nomiclabs/hardhat-web3')
require("solidity-coverage");
// require('@nomiclabs/hardhat-truffle5')

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
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
