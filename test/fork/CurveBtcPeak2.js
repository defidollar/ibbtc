const { expect } = require('chai')
const { web3 } = require('hardhat')
const { BigNumber } = ethers

const mintFeeFactor = BigNumber.from('9990')
const redeemFeeFactor = BigNumber.from('9990')
const PRECISION = BigNumber.from('10000')
const ZERO = BigNumber.from('0')

// const CurveBtcPeak = artifacts.require('CurveBtcPeak')
const CurveLPToken = artifacts.require('CurveLPToken')
const Swap = artifacts.require('Swap')
const Sett = artifacts.require('Sett')

const badgerDevMultisig = '0xB65cef03b9B89f99517643226d76e286ee999e77'

describe.only('mainnet:fork - CurveBtcPeak', function () {
  before('setup contracts', async function () {
    alice = (await ethers.getSigners())[0].address
    const [CurveBtcPeak, Core, bBTC] = await Promise.all([
      ethers.getContractFactory('CurveBtcPeak'),
      ethers.getContractFactory('Core'),
      ethers.getContractFactory('bBTC'),
    ])
    const core = await Core.deploy()
    let [bBtc, curveBtcPeak, curveLPToken, swap, sett] = await Promise.all([
      bBTC.deploy(core.address),
      CurveBtcPeak.deploy(),
      CurveLPToken.at('0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3'),
      Swap.at('0x7fC77b5c7614E1533320Ea6DDc2Eb61fa00A9714'),
      Sett.at('0xd04c48A53c111300aD41190D63681ed3dAd998eC'),
    ])
    await Promise.all([
      core.initialize(bBtc.address),
      core.whitelistPeak(curveBtcPeak.address),
      curveBtcPeak.initialize(core.address, bBtc.address),
      curveBtcPeak.whitelistCurvePool(
        curveLPToken.address,
        swap.address,
        sett.address,
      ),
    ])
    _artifacts = { curveBtcPeak, curveLPToken, bBtc, sett }

    await web3.eth.sendTransaction({
      to: badgerDevMultisig,
      value: web3.utils.toWei('1'),
      from: alice,
    })
    await impersonateAccount(badgerDevMultisig)
    await sett.approveContractAccess(curveBtcPeak.address, {
      from: badgerDevMultisig,
    })
  })

  it('mintWithCurveLP', async function () {
    const { curveLPToken, curveBtcPeak } = _artifacts
    const crvRenWSBTCHolder = '0x15bf9a8de0e56112ee0fcf85e3c4e54fb22346dc' // this account has some crvRenWSBTC
    const amount = BigNumber.from('1').mul(ethers.constants.WeiPerEther)
    await impersonateAccount(crvRenWSBTCHolder)
    await curveLPToken.transfer(alice, amount, { from: crvRenWSBTCHolder })
    await curveLPToken.approve(_artifacts.curveBtcPeak.address, amount)
    await curveBtcPeak.mintWithCurveLP(0, amount)
  })
})

async function impersonateAccount(account) {
  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [account],
  })
}
