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
        curveBtcPeak.whitelistCurvePool(curveLPToken.address, swap.address, sett.address)
    ])
    return { curveBtcPeak, curveLPToken, bBtc, sett, swap, core }
}

const badgerDevMultisig = '0xB65cef03b9B89f99517643226d76e286ee999e77'

async function setupMainnetContracts(feeSink) {
    await network.provider.request({
        method: "hardhat_reset",
        params: [{
            forking: {
                jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY}`,
                blockNumber: 11685090 // having a consistent block number speeds up the tests across runs
            }
        }]
    })
    const [ UpgradableProxy, CurveBtcPeak, Core, bBTC ] = await Promise.all([
        ethers.getContractFactory("UpgradableProxy"),
        ethers.getContractFactory('CurveBtcPeak'),
        ethers.getContractFactory('Core'),
        ethers.getContractFactory('bBTC'),
    ])
    let core = await UpgradableProxy.deploy()
    const [ bBtc, curveLPToken, swap, sett ] = await Promise.all([
        bBTC.deploy(core.address),
        ethers.getContractAt('CurveLPToken', '0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3'),
        ethers.getContractAt('Swap', '0x7fC77b5c7614E1533320Ea6DDc2Eb61fa00A9714'),
        ethers.getContractAt('Sett', '0xd04c48A53c111300aD41190D63681ed3dAd998eC')
    ])
    await core.updateImplementation((await Core.deploy(bBtc.address)).address)
    core = await ethers.getContractAt('Core', core.address)

    let curveBtcPeak = await UpgradableProxy.deploy()
    await curveBtcPeak.updateImplementation((await CurveBtcPeak.deploy(core.address, bBtc.address)).address)
    curveBtcPeak = await ethers.getContractAt('CurveBtcPeak', curveBtcPeak.address)

    await Promise.all([
        core.whitelistPeak(curveBtcPeak.address),
        curveBtcPeak.modifyConfig(1000, 9990, 9990, feeSink),
        curveBtcPeak.whitelistCurvePool(curveLPToken.address, swap.address, sett.address)
    ])
    await web3.eth.sendTransaction({ to: badgerDevMultisig, value: web3.utils.toWei('1'), from: (await ethers.getSigners())[0].address })
    await impersonateAccount(badgerDevMultisig)
    await sett.connect(ethers.provider.getSigner(badgerDevMultisig)).approveContractAccess(curveBtcPeak.address)
    return { curveBtcPeak, curveLPToken, bBtc, sett, swap, core }

}

const crvRenWSBTCHolder = '0x664dd5bcf28bbb3518ff532a384849830f2154ea'

async function getCrvRenWSBTC(curveLPToken, account, amount) {
    await impersonateAccount(crvRenWSBTCHolder)
    return curveLPToken.connect(ethers.provider.getSigner(crvRenWSBTCHolder)).transfer(account, amount)
}

async function impersonateAccount(account) {
    await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [account],
    })
}

module.exports = { setupContracts, setupMainnetContracts, getCrvRenWSBTC }
