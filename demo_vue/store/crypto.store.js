import Web3 from "web3"
import { Log, Warn, SentryLog } from "@/helpers/dev"

import {
    isEtheriumWindow,
    getEthAccount,
    createProvider,
    switchNetwork,
    addMFSToken,
    getLatestBlock,
    tokenFormatFromWei,
    increaseGas,
    getRevertReason,
} from "@/helpers/crypto"
import {
    isValidAccountService,
    getUsersBatchService,
    getAuthMessageService,
    verifyAuthMessageService,
} from "@/api/user"
import {
    defineStructureIndexes,
    nullEmptyHash,
    countPartnersInLvl,
    countSpendInLvl,
    countPureRevenue,
    getClassicTypeByLevel,
    getClassicPriceByLevel,
} from "@/helpers/matrix"
import { watchLostTxs, saveTx } from "@/helpers/lostTx"
import { DICT, LSTORAGE } from "@/config/constants"
import { getLocalStorageElement, setLocalStorageElement } from "@/helpers/localstorage"
import "@/helpers/promises"

import mfsAbi from "@/api/mfs-abi.json"
import mainAbi from "@/api/main-abi.json"
import sfcAbi from "@/api/sfc-abi.json"
import { vm } from "@/app.js"

const emulateSlowTx = false

export default {
    state: {
        provider: null,
        connecting: null, // при первой инициализации dApp страниц (полная прогрузка)
        web3: {},
        connected: null, // критичная прогрузка от checkConnect
        account: null,
        remember_token: null,
        contracts: {
            main: null,
            sfc: null,
            mfs: null,
        },
        balance: {
            bnb: 0.0,
            sfc: 0.0,
            busd: 0.0,
        },
        meta: {
            parent: null,
            nonce: 0,
            gasLimit: DICT.DEFAULT_GAS_LIMIT,
            gasPrice: DICT.DEFAULT_GAS_PRICE,
            maxFeePerGas: DICT.DEFAULT_GAS_PRICE,
        },
        connectionWallet: "",
    },
    getters: {
        isConnecting(state) {
            return state.connecting
        },
        getWeb3(state) {
            return state.web3
        },
        isActiveWallet(state) {
            return state.account !== null
        },
        isConnected(state) {
            return state.connected
        },
        getAccount(state) {
            return state.account
        },
        getToken(state) {
            return state.remember_token
        },
        getParent(state) {
            return state.meta.parent
        },
        getBalance(state) {
            return {
                bnb: state.balance.bnb.toFixed(4),
                sfc: state.balance.sfc.toFixed(2),
                busd: state.balance.busd.toFixed(2),
            }
        },
        getGas(state) {
            const isValidNumber = (n) => Number.isFinite(Number(n))

            return {
                limit: isValidNumber(state.meta.gasLimit) ? state.meta.gasLimit : DICT.DEFAULT_GAS_LIMIT,
                price: isValidNumber(state.meta.gasPrice) ? state.meta.gasPrice : DICT.DEFAULT_GAS_PRICE,
                max: isValidNumber(state.meta.maxFeePerGas) ? state.meta.maxFeePerGas : DICT.DEFAULT_GAS_MAX,
            }
        },
        getNonce(state) {
            return state.meta.nonce
        },
        getMinTransactionFee(state, getters) {
            const { limit, price } = getters.getGas
            return Number(price) * Number(limit)
        },
        getMainContract(state) {
            return state.contracts.main
        },
        getMFSContract(state) {
            return state.contracts.mfs
        },
        getSFCContract(state) {
            return state.contracts.sfc
        },
        getEstimateParams(state, getters) {
            return {
                from: state.account,
                // value: getters.getGas.price,
            }
        },
        getSendParams(state, getters) {
            return {
                nonce: getters.getNonce,
                from: state.account,
                gas: Number(getters.getGas.limit),
                type: "0x2",
                // gasPrice: getters.getGas.price,
                maxFeePerGas: emulateSlowTx ? "30000000001" : getters.getGas.max,
                maxPriorityFeePerGas: emulateSlowTx ? "30000000000" : getters.getGas.price,
            }
        },
        getConnectionWallet(state) {
            return state.connectionWallet
        },
    },
    mutations: {
        setConnecting(state, val) {
            state.connecting = val
        },
        setProvider(state, provider) {
            state.provider = provider
        },
        setWeb3Instance(state) {
            const web3Instance = new Web3(state.provider)
            web3Instance.eth.transactionBlockTimeout = emulateSlowTx ? 10 : 250
            web3Instance.eth.transactionConfirmationBlocks = 1

            state.web3 = web3Instance

            if (process.env.NODE_ENV === "development") {
                window.Web3 = web3Instance
            }
        },
        setContact(state, { value, name }) {
            state.contracts = {
                ...state.contracts,
                [name]: value,
            }
        },
        setConnect(state, val) {
            state.connected = val

            setLocalStorageElement(LSTORAGE.connected, val)
        },
        setAccount(state, account) {
            state.account = account
            // Sentry.setUser({ id: account })
        },
        setToken(state, token) {
            state.remember_token = token

            setLocalStorageElement(LSTORAGE.token, token)
        },
        setBalance(state, { value, symbol }) {
            state.balance = {
                ...state.balance,
                [symbol]: value,
            }
        },
        setMeta(state, { value, name }) {
            Log(`set meta ${name} : ${value}`)
            state.meta = {
                ...state.meta,
                [name]: value,
            }
        },
        setConnectionWallet(state, { name, type = "default" }) {
            setLocalStorageElement(LSTORAGE.wallet, name)
            const timeStamp = new Date().getTime()
            state.connectionWallet = `${name}:${type}:${timeStamp}`
        },

        resetState(state) {
            state.provider = null
            state.web3 = null
            state.connecting = null
            state.connected = null
            state.account = null
            state.remember_token = null
            state.contracts = {
                main: null,
                sfc: null,
                mfs: null,
            }
            state.balance = {
                bnb: 0.0,
                sfc: 0.0,
                busd: 0.0,
            }
            state.meta = {
                parent: null,
                nonce: 0,
                gasLimit: DICT.DEFAULT_GAS_LIMIT,
                gasPrice: DICT.DEFAULT_GAS_PRICE,
                maxFeePerGas: DICT.DEFAULT_GAS_PRICE,
            }
        },
    },
    actions: {
        async init({ dispatch, commit, state }) {
            const lsConnected = getLocalStorageElement(LSTORAGE.connected)

            if (lsConnected === true) {
                const routerRequireWallet = vm.$router.currentRoute.meta && vm.$router.currentRoute.meta.requiresWallet
                const routerRequireAuth = vm.$router.currentRoute.meta && vm.$router.currentRoute.meta.requiresAuth

                if (routerRequireWallet) {
                    dispatch("initApp")
                    dispatch("initAuth")
                } else {
                    dispatch("initAppMinimal")
                }

                watchLostTxs()
            }
        },

        async checkRegistration({ dispatch, getters, state }, includeSaved) {
            try {
                let parent = null
                if (includeSaved) {
                    parent = getters.getParent
                } else {
                    parent = await getters.getMainContract.methods.parent(state.account).call()
                }

                if (nullEmptyHash(parent) === null) {
                    throw new Error(`${vm.$t("errors.registrationError")}`)
                }

                // если есть parent, проверить на наличие в базе
                // покрытие кейса с прерванной транзакцией после регистрации
                if (state.account) {
                    const [accErr, accRes] = await isValidAccountService({ hash: state.account })

                    if (accErr) {
                        // TODO - как то еще отправлять транзакцию, но хеш операции .register не знаем
                        // лучше делать на бекенде или тянуть api polygonscan
                        await dispatch(
                            "user/registerAccount",
                            {
                                account: state.account,
                                parent: parent,
                            },
                            { root: true }
                        )
                    }
                }

                return [null, parent]
            } catch (err) {
                Warn("registrationCheck", err)
                return [err, null]
            }
        },

        // check window.etherium exists, get user account, check provider chain, create contract instance
        async checkConnect({ commit, dispatch, getters }, payload) {
            try {
                const [windowError, ethWindowName] = await isEtheriumWindow()
                payload && payload.onEthWindow && payload.onEthWindow([windowError, ethWindowName])
                if (windowError) throw windowError

                const [providerError, provider] = await dispatch("checkProvider")
                if (providerError) throw providerError

                const [connectError, connected] = await dispatch("connectWeb3")
                if (connected === "redispatch") {
                    Log("WANTED REDISPATCH")
                    await dispatch("checkProvider")
                    await dispatch("connectWeb3")
                }
                payload && payload.onNetwork && payload.onNetwork([connectError, connected])
                if (connectError) throw connectError

                Log("at getEthAccount")
                const [accError, account] = await getEthAccount()
                if (accError) throw accError
                Log("after getEthAccount")

                // ШАГ 1. критичные данные загружены, пользователь имеет кошелек и подключен к правильной сети
                commit("setAccount", account)

                const [contractError, contract] = await dispatch("connectContract", account)
                if (contractError) throw contractError
                commit("setContact", { value: contract, name: "main" })

                const [mfsContractError, mfsContract] = await dispatch("connectTokenContract", account)
                if (mfsContractError) throw mfsContractError
                commit("setContact", { value: mfsContract, name: "mfs" })

                const [sfcContractError, sfcContract] = await dispatch("connectSfcContract", account)
                if (sfcContractError) throw sfcContractError
                commit("setContact", { value: sfcContract, name: "sfc" })

                if (getters.getParent === null) {
                    const parent = await contract.methods.parent(account).call()

                    commit("setMeta", { name: "parent", value: parent })
                }

                // Шаг 2. Подключены контракты, пользователь может начать взаимодействие с сайтом
                commit("setConnect", true)

                return [null, account]
            } catch (err) {
                Warn("connect", err)
                commit("setConnect", false)
                return [err, null]
            }
        },

        async initApp({ commit, dispatch, state }, payload) {
            // проблемы с лейаутом, mounted от layout вызывается всегда
            if (state.connecting === false) return

            commit("setConnecting", true)

            // как правило ставится один раз при подключении кошелька, не требует повторной установки для дальнейших действий
            if (payload && payload.name) {
                commit("setConnectionWallet", { name: payload.name })
            }

            const [connectError, account] = await dispatch("checkConnect")
            if (connectError) throw connectError
            payload && payload.onConnect && payload.onConnect()

            const [gasErr, gasRes] = await dispatch("getGas")
            if (gasErr) throw gasErr

            const [accErr, accRes] = await dispatch("getBalances", account)
            if (accErr) throw accErr

            // ШАГ 3. Получены данные по газу и информация пользователя
            // занимает много времени, не имеет высокой кртичности для отображения данных, но критично для выполнения транзакций

            commit("setConnecting", false)
        },

        async initAppMinimal({ dispatch, state, commit }) {
            const [providerError, provider] = await dispatch("checkProvider")
            const [connectError, connected] = await dispatch("connectWeb3")
            const [accError, account] = await getEthAccount()
            account && commit("setAccount", account)
        },

        async initAuth({ dispatch, commit, state }, protectedRoute) {
            const lsToken = getLocalStorageElement(LSTORAGE.token)
            if (lsToken) {
                commit("setToken", lsToken)
                return lsToken
            }

            const [err, message] = await getAuthMessageService()
            if (err) throw err

            let signed = true
            const signature = await state.web3.eth.personal
                .sign(message.message, state.account)
                .catch(() => (signed = false))

            if (!signature || !signed) {
                await vm.$swal
                    .fire({
                        confirmButtonText: vm.$t("confirm"),
                        text: vm.$t("errors.auth"),
                    })
                    .then(async (result) => {
                        vm.$router.push({ name: "academy" })
                        commit("resetState")
                    })
            }

            const [authErr, auth] = await verifyAuthMessageService({
                address: state.account,
                signature: signature,
                message: message.message,
            })

            if (authErr) throw authErr

            commit("setToken", auth.remember_token)

            return auth.remember_token
        },

        async checkProvider({ commit }) {
            try {
                const provider = createProvider()
                const providerName = getLocalStorageElement(LSTORAGE.wallet)

                commit("setProvider", provider)

                if (providerName === "walletconnect" && provider.enable) {
                    Log("enable?", !provider.connected)
                    if (!provider.connected) {
                        await provider.enable()
                    }
                }

                return [null, provider]
            } catch (err) {
                Warn(err)
                return [err, null]
            }
        },

        async connectWeb3({ dispatch, commit, state }) {
            try {
                commit("setWeb3Instance")

                const [networkErr, networkRes] = await switchNetwork()
                if (networkErr) throw networkErr

                // NOT WORKING ON DAPP
                // if (!LSTORAGE.getItem("force_token_promted")) {
                //     const [mfsErr, mfsRes] = await addMFSToken()
                //     // if (mfsErr) throw mfsErr
                //     LSTORAGE.setItem("force_token_promted", true)
                // }

                return [null, networkRes]
            } catch (err) {
                Warn(err)
                return [err, null]
            }
        },

        async connectContract({ state }, account) {
            try {
                const contract = new state.web3.eth.Contract(mainAbi, DICT.CONTRACT_MAIN, { from: account })

                return [null, contract]
            } catch (err) {
                Warn("main contract", err)
                return [new Error("Error connecting contract"), null]
            }
        },

        async connectTokenContract({ state }, account) {
            try {
                const contract = new state.web3.eth.Contract(mfsAbi, DICT.CONTRACT_MFS)

                return [null, contract]
            } catch (err) {
                Warn("token contract", err)
                return [new Error("Error connecting token contract"), null]
            }
        },

        async connectSfcContract({ state }, account) {
            try {
                const contract = new state.web3.eth.Contract(sfcAbi, DICT.CONTRACT_SFC)

                return [null, contract]
            } catch (err) {
                Warn("sfc contract", err)
                return [new Error("Error connecting SFC contract"), null]
            }
        },

        async getGas({ dispatch, commit, getters, state }) {
            try {
                // get gas params - limit from latest block, price from eth utils
                const [blockErr, latestBlock] = await getLatestBlock("pending")
                if (blockErr) throw blockErr

                const gasPrice = await state.web3.eth.getGasPrice()
                const gasAgressive = Math.round(Number(gasPrice) * DICT.ESTIMATED_GAS_PRIORIY)

                commit("setMeta", { name: "gasPrice", value: gasAgressive.toString() })

                if (latestBlock && latestBlock.baseFeePerGas) {
                    Log("baseFeePerGas", latestBlock.baseFeePerGas)
                    const maxFee = Math.round(DICT.ESTIMATE_GAS_MAX_PER_BASE * latestBlock.baseFeePerGas) + gasAgressive
                    commit("setMeta", { name: "maxFeePerGas", value: maxFee.toString() })
                }

                // const gasLimit = Math.round(latestBlock.gasLimit / latestBlock.transactions.length).toString()
                // commit("setMeta", { name: "gasLimit", value: gasLimit })

                Log({ gasPrice }, { gasAgressive: gasAgressive.toString() })

                return [null, true]
            } catch (err) {
                Warn("gas", err)
                return [err, null]
            }
        },

        async getBalances({ dispatch, commit, state, getters }, account) {
            try {
                // bnb balance
                let balance = await state.web3.eth.getBalance(account)
                commit("setBalance", { symbol: "bnb", value: tokenFormatFromWei(balance) })

                // mfs balance
                let balanceToken = await getters.getMFSContract.methods.balanceOf(account).call()
                commit("setBalance", { symbol: "busd", value: tokenFormatFromWei(balanceToken, "ether") })

                // sfc balance
                let balanceSfc = await getters.getSFCContract.methods.balanceOf(account).call()
                commit("setBalance", { symbol: "sfc", value: tokenFormatFromWei(balanceSfc) })

                const nonce = await dispatch("getNonce", account)
                return [null, balance]
            } catch (err) {
                Warn("balances", err)
                return [err, null]
            }
        },

        async getNonce({ state, commit }, account) {
            const nonce = await state.web3.eth.getTransactionCount(account || state.account)
            commit("setMeta", { name: "nonce", value: Number(nonce) })

            return nonce
        },

        async getProgramLevels({ dispatch, commit, getters, state }, account) {
            try {
                const tAccount = account || state.account
                const mainContract = getters.getMainContract

                let levels = [...Array(12).keys()]

                await Promise.all(
                    levels.map(async (lvl) => {
                        const result = await mainContract.methods.activate(tAccount, lvl).call()
                        levels[lvl] = {
                            lvl: lvl,
                            active: result,
                        }
                    })
                )

                Log("levels before gap", levels)

                await Promise.all(
                    levels.map(async (level) => {
                        const method = getClassicTypeByLevel(level.lvl) === "s3" ? "matrixS3" : "matrixS6"
                        let matrixResponce = await mainContract.methods[method](tAccount, level.lvl).call()

                        if (matrixResponce && +matrixResponce.slot > 0) {
                            if (level.active === false) {
                                levels[level.lvl] = {
                                    lvl: level.lvl,
                                    active: "gap",
                                }
                            }
                        }
                    })
                )

                Log("levels after gap", levels)

                // check gaps for non-reactivation
                const lastActive = levels ? levels.findLast((x) => x.active) : null
                if (lastActive) {
                    levels = levels.map((level) => {
                        if (lastActive.lvl > level.lvl) {
                            if (level.active === false) {
                                return {
                                    ...level,
                                    active: "gap",
                                }
                            }
                        }

                        return level
                    })
                }

                return [null, levels]
            } catch (err) {
                Warn("getProgramLevels", err)
                SentryLog(err, "levels")

                return [new Error(`${vm.$t("matrix.levelError")}`), null]
            }
        },

        async createTransaction({ dispatch, getters, state }, { func, onTransactionHash }) {
            await dispatch("getGas")
            await dispatch("getNonce")

            let estimatedGas = await func.estimateGas({ ...getters.getEstimateParams })
            estimatedGas = increaseGas(estimatedGas)

            return func
                .send({
                    ...getters.getSendParams,
                    gas: estimatedGas,
                })
                .on("transactionHash", (hash) => {
                    onTransactionHash && onTransactionHash(hash)
                })
        },

        async registerNewAcccount({ dispatch, commit, getters, state }, { account, parentAcc, onBlockchainPending }) {
            try {
                const mainContract = getters.getMainContract

                let regHash
                const regRes = await dispatch("createTransaction", {
                    func: mainContract.methods.registration(parentAcc),
                    onTransactionHash: (hash) => {
                        regHash = hash
                        onBlockchainPending && onBlockchainPending()
                    },
                }).catch((e) => {
                    if (e.message.includes("not mined within")) {
                        const handle = setInterval(() => {
                            state.web3.eth.getTransactionReceipt(regHash).then((resp) => {
                                if (resp != null && resp.blockNumber > 0) {
                                    clearInterval(handle)
                                    dispatch(
                                        "user/registerAccount",
                                        {
                                            account,
                                            parent: parentAcc,
                                        },
                                        { root: true }
                                    )
                                }
                            })
                        }, 10000)
                    } else {
                        throw e
                    }
                })

                const accResult = await dispatch(
                    "user/registerAccount",
                    {
                        account,
                        parent: parentAcc,
                    },
                    { root: true }
                )

                Log({ regRes })

                await dispatch(
                    "user/sendTransaction",
                    {
                        transactions: [
                            {
                                type: "registration",
                                transaction_hash: regRes.transactionHash,
                                from: account,
                                to: parentAcc,
                            },
                        ],
                    },
                    { root: true }
                ).catch(Warn)

                commit("setMeta", { name: "parent", value: parentAcc })

                await dispatch("getBalances", account)

                return [null, accResult]
            } catch (err) {
                Warn("register", err)
                SentryLog(err, "register")

                const errParsed = getRevertReason(err)
                return [errParsed, null]
            }
        },
        async verboseBuyGas(
            { state, getters, dispatch },
            { lvl, priceInEther, onAllowancePending, onBlockchainPending }
        ) {
            try {
                await dispatch("getGas")
                await dispatch("getNonce")

                let gasPrice = state.web3.utils.toBN(getters.getGas.price)
                const price = state.web3.utils.toWei(priceInEther.toString(), "ether")

                let gasApprove = "0"
                let gasBuy = "0"

                await getters.getMFSContract.methods
                    .approve(DICT.CONTRACT_MAIN, price)
                    .estimateGas({ ...getters.getEstimateParams })
                    .then((gasAmount) => {
                        gasApprove = Math.round(gasAmount * DICT.ESTIMATED_GAS_INCREASE)
                    })

                const allowance = await getters.getMFSContract.methods
                    .allowance(getters.getAccount, DICT.CONTRACT_MAIN)
                    .call()

                Log({ allowance }, { price })

                if (Number(allowance) < Number(price)) {
                    onAllowancePending && onAllowancePending()
                    Log("send .approve", {
                        ...getters.getSendParams,
                        gas: gasApprove,
                    })
                    await getters.getMFSContract.methods
                        .approve(DICT.CONTRACT_MAIN, price)
                        .send({
                            ...getters.getSendParams,
                            gas: gasApprove,
                        })
                        .on("transactionHash", (hash) => {
                            onBlockchainPending && onBlockchainPending()
                        })
                }

                Log("estimate buy", { ...getters.getEstimateParams })
                await getters.getMainContract.methods
                    .buy(lvl)
                    .estimateGas({ ...getters.getEstimateParams })
                    .then((gasAmount) => {
                        gasBuy = Math.round(gasAmount * DICT.ESTIMATED_GAS_INCREASE)
                    })

                gasApprove = state.web3.utils.toBN(gasApprove.toString())
                gasBuy = state.web3.utils.toBN(gasBuy.toString())

                let totalGasPrice = gasPrice.mul(gasApprove.add(gasBuy))
                totalGasPrice = state.web3.utils.fromWei(totalGasPrice.toString(), "ether")

                Log("totalGasPrice", totalGasPrice)

                return [null, totalGasPrice]
            } catch (err) {
                Warn("verboseBuyGas", err)
                SentryLog(err, "buy")

                return [getRevertReason(err, "Error estimating buying gas"), null]
            }
        },
        async buyLevel(
            { dispatch, commit, getters, state },
            { lvl, priceInEther, onAllowancePending, onTransactionPending, onBlockchainPending }
        ) {
            const { account } = state
            const mainContract = getters.getMainContract
            const mfsContract = getters.getMFSContract
            await dispatch("getBalances", account)

            try {
                const price = state.web3.utils.toWei(priceInEther.toString(), "ether")
                const curBalance = state.web3.utils.toWei(state.balance.busd.toString(), "ether")
                const allowance = await mfsContract.methods.allowance(account, DICT.CONTRACT_MAIN).call()
                // Log(`allowance - ${allowance}`, `price - ${price}`, "send params", getters.getSendParams)

                if (Number(allowance) < Number(price)) {
                    if (Number(price) > Number(curBalance)) {
                        // throw new Error(`Недостаточный баланс DAI. Необходимо - ${priceInEther} DAI`)
                        vm.$swal(
                            `${this.$t("matrix.buyLevel.insufficientFunds")}.
                             ${this.$t("matrix.buyLevel.need")} - ${priceInEther} DAI <br/>
                             <a href="/academy" target="_blank">Как пополнить</a>`
                        )
                        return
                    }
                }

                // Approve passed, buy transaction
                let estimatedGas = state.meta.gasLimit
                await mainContract.methods
                    .buy(lvl)
                    .estimateGas({ ...getters.getEstimateParams })
                    .then((gasAmount) => {
                        estimatedGas = Math.round(gasAmount * DICT.ESTIMATED_GAS_INCREASE)
                    })

                onTransactionPending && onTransactionPending()
                Log("send .buy", {
                    ...getters.getSendParams,
                    gas: estimatedGas,
                })

                let trHash = null
                const buyResult = await mainContract.methods
                    .buy(lvl)
                    .send({
                        ...getters.getSendParams,
                        gas: estimatedGas,
                    })
                    .on("transactionHash", (hash) => {
                        trHash = hash
                        Log({ hash })
                        onBlockchainPending && onBlockchainPending()
                    })
                    .on("confirmation", function (confirmationNumber, receipt) {
                        Log("confirmation", confirmationNumber, receipt)
                    })
                    .on("receipt", function (receipt) {
                        Log("receipt", receipt)
                    })
                    .catch((e) => {
                        if (e.message.includes("not mined within")) {
                            saveTx({ tx: trHash, action: "buy", params: { account, lvl: lvl } })
                            const error = Error(vm.$t("lostTxs.buyWait"))
                            error.status = 202
                            throw error
                        } else {
                            throw e
                        }
                    })

                Log(".buy await compleate")
                // const [err1, levels1] = await dispatch("getProgramLevels")
                // Log("1lvls", levels1)

                commit(
                    "user/setClassMatrixLevel",
                    {
                        lvl: lvl,
                        active: true,
                    },
                    { root: true }
                )

                await dispatch("sendBuyTransaction", buyResult).catch(Warn)

                // save on backend
                await dispatch(
                    "user/setLevel",
                    {
                        account: account,
                        level: lvl + 1, // backend starts with 1
                    },
                    { root: true }
                )

                await dispatch("getBalances", account)

                // const [err2, levels2] = await dispatch("getProgramLevels")
                // Log("2lvls", levels2)

                return [null, buyResult]
            } catch (err) {
                Warn("buy", err)
                SentryLog(err, "buy")
                return [getRevertReason(err, "Error, contact administrator"), null]
            }
        },

        async sendBuyTransaction({ dispatch }, buyResult) {
            Log({ buyResult })
            if (!buyResult) return

            const txHash = buyResult.transactionHash
            const eventNames = Object.keys(buyResult.events).filter((key) =>
                ["simpleBuy", "newSlot", "upgrade", "updateOtherPersonStructure"].includes(key)
            )

            const transactions = eventNames.map((key) => {
                const event = buyResult.events[key]

                let lvlName = event.returnValues.lvl !== undefined ? "lvl" : "newLvl"

                return {
                    type: key,
                    transaction_hash: txHash,
                    from: event.returnValues.buyer,
                    to: event.returnValues.receiver,
                    price: getClassicPriceByLevel(+event.returnValues.lvl),
                    lvl: +event.returnValues[lvlName] + 1,
                }
            })

            Log("all events: ", Object.keys(buyResult.events))

            await dispatch("user/sendTransaction", { transactions }, { root: true }).catch((err) => {
                SentryLog(err, "send transaction")
            })
        },

        async requestStructure(
            { dispatch, commit, getters, state },
            { account, level, type, slot: slotProp, previousActiveSlot, fetchUser, countRevenue }
        ) {
            try {
                let structure = {
                    slot: null,
                    totalSlots: "0",
                    totalPartners: 0,
                    totalFrozen: 0,
                    totalSpend: 0,
                    pureRevenue: 0,
                    pureRevenueCycle: 0,
                    autoRecycle: null,
                    autoUpgrade: null,
                    lvl1: [null, null],
                    lvl2: [...Array(4)].map((_) => null),
                    lvl3: [...Array(8)].map((_) => null),
                }
                const contract = getters.getMainContract

                // получаем slot - индекс
                const method = type === "s3" ? "matrixS3" : "matrixS6"
                let matrixResponce = await contract.methods[method](account, level.toString()).call()
                Log(matrixResponce, account, level.toString())

                // ставим мета параметры и делаем просчеты обьектов
                structure.totalSlots = matrixResponce.slot
                const { partners, frozen } = countPartnersInLvl(type, matrixResponce)
                structure.totalPartners = partners
                structure.totalFrozen = state.web3.utils.fromWei(frozen, "ether")
                structure.totalSpend = countSpendInLvl(partners, level)

                let { slot } = matrixResponce
                if (slotProp !== undefined) {
                    slot = slotProp.toString()
                }
                if (previousActiveSlot) {
                    if (+slot > 0) {
                        slot = +slot - 1
                    }
                }
                structure.slot = slot

                // определяем индексы
                const { indexesS3, indexesS6Lvl1, indexesS6Lvl2 } = defineStructureIndexes({ type, slot })
                // Log(indexesS3, indexesS6Lvl1, indexesS6Lvl2)

                // настройки рецикл / автоапгрейд
                const settings = await contract.methods.getSettings(account, level.toString()).call()
                Log({ settings })

                if (settings) {
                    structure.autoRecycle = settings["0"]
                    structure.autoUpgrade = settings["1"]
                }

                // запрашиваем по индексам
                const shouldRequestLvl1 = countPartnersInLvl(type, matrixResponce).partners > 0
                let shouldRequestLvl2 = shouldRequestLvl1

                if (type === "s3") {
                    if (shouldRequestLvl1) {
                        await Promise.all(
                            indexesS3.map(async (index, idx) => {
                                const childsS3Res = await contract.methods
                                    .childsS3(account, level, index)
                                    .call()
                                    .catch((err) => {
                                        Warn(err)
                                    })
                                structure.lvl1[idx] = nullEmptyHash(childsS3Res)
                            })
                        )
                    }
                } else if (type === "s6") {
                    if (shouldRequestLvl1) {
                        await Promise.all(
                            indexesS6Lvl1.map(async (index, idx) => {
                                const childsS6Lvl1 = await contract.methods
                                    .childsS6Lvl1(account, level, index)
                                    .call()
                                    .catch((err) => {
                                        Warn(err)
                                    })
                                // Log(idx, { childsS6Lvl1 })
                                structure.lvl1[idx] = nullEmptyHash(childsS6Lvl1)
                            })
                        )
                    }

                    shouldRequestLvl2 = structure.lvl1.some((x) => x !== null)

                    if (shouldRequestLvl2) {
                        await Promise.all(
                            indexesS6Lvl2.map(async (index, idx) => {
                                const childsS6Lvl2 = await contract.methods
                                    .childsS6Lvl2(account, level, index)
                                    .call()
                                    .catch((err) => {
                                        Warn(err)
                                    })
                                structure.lvl2[idx] = nullEmptyHash(childsS6Lvl2)
                            })
                        )
                    }
                }

                // count total revenue only once
                structure.pureRevenue = countRevenue ? countRevenue : countPureRevenue({ ...structure, level })
                structure.pureRevenueCycle = countPureRevenue({ ...structure, level, forCurrentSlot: true })

                // fetch users by address
                if (fetchUser) {
                    // const [err, users] = await getUsersBatchService({ accounts: structure.lvl1 })
                    // console.log({ users })

                    await Promise.all(
                        structure.lvl1.map(async (address, idx) => {
                            if (address) {
                                const res = await dispatch(
                                    "user/getUserByField",
                                    {
                                        account: address,
                                    },
                                    { root: true }
                                ).catch(Warn)

                                if (res && res.users) {
                                    structure.lvl1[idx] = res.users
                                }
                            }
                        })
                    )
                    await Promise.all(
                        structure.lvl2.map(async (address, idx) => {
                            if (address) {
                                const res = await dispatch(
                                    "user/getUserByField",
                                    {
                                        account: address,
                                    },
                                    { root: true }
                                ).catch(Warn)

                                if (res && res.users) {
                                    structure.lvl2[idx] = res.users
                                }
                            }
                        })
                    )
                }

                return [null, structure]
            } catch (err) {
                Warn(err)
                SentryLog(err, "structure")

                return [err, null]
            }
        },
        async requestTree({ state, getters }, { account, onNext }) {
            try {
                let tree = []
                const contract = getters.getMainContract

                let shouldGo = true
                let index = 0

                while (shouldGo) {
                    const child = await contract.methods
                        .childs(account, index.toString())
                        .call()
                        .catch((err) => {
                            shouldGo = false
                        })

                    if (child) {
                        index++
                        tree.push({ idx: index, account: child })
                        onNext && onNext(tree)
                    }
                }

                return [null, tree]
            } catch (err) {
                Warn(err)
                return [err, null]
            }
        },
        async withdrawFrozen({ dispatch, getters, state }, { lvl, type }) {
            try {
                const contract = getters.getMainContract
                const method = type === "s3" ? "withdrawS3" : "withdrawS6"

                await dispatch("createTransaction", { func: contract.methods[method](lvl) })

                return [null, true]
            } catch (err) {
                Warn(err)
                SentryLog(err, "frozen")
                return [getRevertReason(err), null]
            }
        },
        async changeAutoReCycle({ dispatch, getters, state }, { flag, lvl }) {
            try {
                const contract = getters.getMainContract

                await dispatch("createTransaction", { func: contract.methods.changeAutoReCycle(lvl) })

                return [null, true]
            } catch (err) {
                Warn(err)
                SentryLog(err, "AutoRecycle")
                return [getRevertReason(err), null]
            }
        },
        async changeAutoUpgrade({ dispatch, getters, state }, { flag, lvl }) {
            try {
                const contract = getters.getMainContract

                await dispatch("createTransaction", { func: contract.methods.changeAutoUpgrade(lvl) })

                return [null, true]
            } catch (err) {
                Warn(err)
                SentryLog(err, "AutoUpgrade")
                return [getRevertReason(err), null]
            }
        },

        async transferAccount({ dispatch, getters, state }, { to }) {
            try {
                const contract = getters.getMainContract

                await dispatch("createTransaction", {
                    func: contract.methods.givePermission(DICT.CREATOR),
                    // onTransactionHash: (hash) => {
                    //     console.log({ hash })
                    // },
                })
                await dispatch("createTransaction", { func: contract.methods.changeAddress(to) })

                return [null, true]
            } catch (err) {
                Warn(err)
                SentryLog(err, "Transfer")
                return [getRevertReason(err), null]
            }
        },

        async logOut({ dispatch, commit, state }) {
            const { provider } = state
            const providerName = getLocalStorageElement(LSTORAGE.wallet)

            localStorage.removeItem(LSTORAGE.connected)
            localStorage.removeItem(LSTORAGE.wallet)
            localStorage.removeItem(LSTORAGE.walletconnect)
            localStorage.removeItem(LSTORAGE.token)

            if (providerName === "walletconnect" && provider.enable) {
                if (provider.connected && provider.disconnect) {
                    await provider.disconnect()
                }
            }

            commit("resetState")

            if (vm.$route.name !== "academy") {
                vm.$router.push({ name: "academy" })
            }
        },
    },
    namespaced: true,
}
