const { BigNumber } = ethers

const blockNumber = 11685090
const badgerDevMultisig = '0xB65cef03b9B89f99517643226d76e286ee999e77'
const wBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
const wBTCWhale = '0x875abe6f1e2aba07bed4a3234d8555a0d7656d12'
// whale has 903 wbtc at blockNumber = 11685090
const wbtcWhaleBalance = BigNumber.from(150).mul(1e8) // wbtc has 8 decimals

const crvPools = {
    sbtc: {
        lpToken: '0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3',
        swap: '0x7fC77b5c7614E1533320Ea6DDc2Eb61fa00A9714',
        sett: '0xd04c48A53c111300aD41190D63681ed3dAd998eC'
    },
    ren: {
        lpToken: '0x49849C98ae39Fff122806C06791Fa73784FB3675',
        swap: '0x93054188d876f558f4a66B2EF1d97d16eDf0895B',
        sett: '0x6dEf55d2e18486B9dDfaA075bc4e4EE0B28c1545'
    },
    tbtc: {
        lpToken: '0x64eda51d3Ad40D56b9dFc5554E06F94e1Dd786Fd',
        swap: '0xC25099792E9349C7DD09759744ea681C7de2cb66',
        sett: '0xb9D076fDe463dbc9f915E5392F807315Bf940334'
    }
}

async function setupMainnetContracts(feeSink) {
    await network.provider.request({
        method: "hardhat_reset",
        params: [{
            forking: {
                jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY}`,
                blockNumber // having a consistent block number speeds up the tests across runs
            }
        }]
    })
    const [ UpgradableProxy, CurveBtcPeak, Core, bBTC ] = await Promise.all([
        ethers.getContractFactory("UpgradableProxy"),
        ethers.getContractFactory('CurveBtcPeak'),
        ethers.getContractFactory('Core'),
        ethers.getContractFactory('bBTC'),
    ])
    let [ core, curveBtcPeak ] = await Promise.all([
        UpgradableProxy.deploy(),
        UpgradableProxy.deploy()
    ])
    const bBtc = await bBTC.deploy(core.address)
    await core.updateImplementation((await Core.deploy(bBtc.address)).address)
    await curveBtcPeak.updateImplementation((await CurveBtcPeak.deploy(core.address, bBtc.address)).address)
    ;([ core, curveBtcPeak ] = await Promise.all([
        ethers.getContractAt('Core', core.address),
        ethers.getContractAt('CurveBtcPeak', curveBtcPeak.address),
    ]))
    await Promise.all([
        core.whitelistPeak(curveBtcPeak.address),
        curveBtcPeak.modifyConfig(6000, 9990, 9990, feeSink)
    ])
    // required for sett contracts whitelist
    await web3.eth.sendTransaction({ to: badgerDevMultisig, value: web3.utils.toWei('1'), from: (await ethers.getSigners())[0].address })
    await impersonateAccount(badgerDevMultisig)
    await impersonateAccount(wBTCWhale)
    return { curveBtcPeak, bBtc, core }

}

async function getPoolContracts(pool, curveBtcPeak = null) {
    const contracts = await Promise.all([
        ethers.getContractAt('CurveLPToken', crvPools[pool].lpToken),
        ethers.getContractAt('Swap', crvPools[pool].swap),
        ethers.getContractAt('Sett', crvPools[pool].sett)
    ])
    if (curveBtcPeak) {
        await contracts[2].connect(ethers.provider.getSigner(badgerDevMultisig)).approveContractAccess(curveBtcPeak)
    }
    return contracts
}

async function mintCrvPoolToken(pool, account, a) {
    const [ _wBTC, _lpToken ] = await Promise.all([
        ethers.getContractAt('IERC20', wBTC),
        ethers.getContractAt('IERC20', crvPools[pool].lpToken)
    ])
    const amount = wbtcWhaleBalance.div(10)
    let _deposit, _amounts
    switch (pool) {
        case 'ren':
            _deposit = await ethers.getContractAt('renDeposit', crvPools.ren.swap)
            _amounts = [0, amount] // [ ren, wbtc ]
            break
        case 'sbtc':
            _deposit = await ethers.getContractAt('sbtcDeposit', crvPools.sbtc.swap)
            _amounts = [0, amount, 0] // [ ren, wbtc, sbtc ]
            break
        case 'tbtc':
            _deposit = await ethers.getContractAt('tbtcDeposit', '0xaa82ca713D94bBA7A89CEAB55314F9EfFEdDc78c')
            _amounts = [0, 0, amount, 0] // [ tbtc, ren, wbtc, sbtc ]
    }
    const signer = ethers.provider.getSigner(wBTCWhale)
    await _wBTC.connect(signer).approve(_deposit.address, amount)
    await _deposit.connect(signer).add_liquidity(_amounts, 0)
    await _lpToken.connect(signer).transfer(account, a)
}

async function setupContracts(feeSink) {
    const [ UpgradableProxy, CurveBtcPeak, Core, bBTC, CurveLPToken, Swap, Sett ] = await Promise.all([
        ethers.getContractFactory("UpgradableProxy"),
        ethers.getContractFactory("CurveBtcPeak"),
        ethers.getContractFactory("Core"),
        ethers.getContractFactory("bBTC"),
        ethers.getContractFactory("CurveLPToken"),
        ethers.getContractFactory("Swap"),
        ethers.getContractFactory("Sett")
    ])
    let core = await UpgradableProxy.deploy()
    const [ bBtc, curveLPToken, swap ] = await Promise.all([
        bBTC.deploy(core.address),
        CurveLPToken.deploy(),
        Swap.deploy(),
    ])
    await core.updateImplementation((await Core.deploy(bBtc.address)).address)
    core = await ethers.getContractAt('Core', core.address)

    let curveBtcPeak = await UpgradableProxy.deploy()
    await curveBtcPeak.updateImplementation((await CurveBtcPeak.deploy(core.address, bBtc.address)).address)
    curveBtcPeak = await ethers.getContractAt('CurveBtcPeak', curveBtcPeak.address)

    const sett = await Sett.deploy(curveLPToken.address)
    await Promise.all([
        core.whitelistPeak(curveBtcPeak.address),
        curveBtcPeak.modifyConfig(1000, 9990, 9990, feeSink),
        curveBtcPeak.modifyWhitelistedCurvePools([{ lpToken: curveLPToken.address, swap: swap.address, sett: sett.address }])
    ])
    return { curveBtcPeak, curveLPToken, bBtc, sett, swap, core }
}

async function impersonateAccount(account) {
    await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [account],
    })
}

module.exports = {
    setupContracts,
    setupMainnetContracts,
    getPoolContracts,
    mintCrvPoolToken,
    crvPools
}
