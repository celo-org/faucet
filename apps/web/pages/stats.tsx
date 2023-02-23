import groupBy from "just-group-by"
import stats from "math-stats"
import { useEffect, useMemo, useState } from "react"
import { Cell, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts'
const url = 'https://explorer.celo.org/alfajores/api?module=account&action=tokentx&address=0x22579CA45eE22E2E16dDF72D955D6cf4c767B0eF'


interface Transfer {
  blockHash: `0x${string}`
  blockNumber: string // example: "34092"
  confirmations: string
  contractAddress: `0x${string}`
  cumulativeGasUsed: string
  from: `0x${string}`
  gas: string
  gasPrice: string
  gasUsed: string
  hash: `0x${string}`
  input: `0x${string}`
  nonce: string
  timeStamp: string
  to: string
  tokenDecimal: string
  tokenID: string
  tokenName: string
  tokenSymbol: string
  transactionIndex: string
  value: string
}

interface Response {
  message: "OK"
  status: "0" | "1"
  result: Transfer[]
}



export default function Stats() {

  const [txList, setTXList] = useState<Transfer[]>([])

  useEffect(() => {
    const fetcher = async () => {
      const response = await fetch(url)

      const data: Response = await response.json()

      const filtered = data.result.filter((tx: Transfer) => {
        return tx.from.toLowerCase() === "0x22579CA45eE22E2E16dDF72D955D6cf4c767B0eF".toLowerCase()
      })

      setTXList(filtered)
    }
    fetcher()
  }, [])





  const txCountperBlock = useMemo(() => {

    // 1 block every 5 seconds is 12 blocks a minute * 60 minutes per hour * hours in period
    const period = 12 * 60 * 6

    const txPerBlock = groupBy(txList, (t) => Number(t.blockNumber) - (Number(t.blockNumber) % (period)) )


    return Object.keys(txPerBlock).map(block => {
      const blockNumber = Number(block)
      const byAddress = groupBy(txPerBlock[blockNumber], (t) => t.to)

      const addresses = Object.keys(byAddress).length

      const perAddress = Object.keys(byAddress).map(address => {
        const txCountForAddress = byAddress[address].length
        return txCountForAddress
      })

      const trailingCount = [12, 11, 10,9, 8, 7,6,5,2,3,2,1].map(n => {
        const previousBlock = blockNumber - n * period
        const size = txPerBlock[previousBlock]?.length || 0
        console.log("size", size)
        return size
      })

      stats


      return {
        txPerHalfDay: txPerBlock[blockNumber].length,
        trailingSTD: stats.standardDeviation(trailingCount),
        addresses,
        maxPerAddress: Math.max(...perAddress),
        modeTxPerAddress: stats.mode(perAddress),
        meanTxPerAddress: stats.mean(perAddress),
        medianTxPerAddress: stats.median(perAddress),
        stdInTXPerAddress: stats.standardDeviation(perAddress),
        harmonicMean: stats.harmonicMean(perAddress)
      }
    })
  }, [txList])


  const countByAddress = useMemo(() => {
      const txByAddress = groupBy(txList, t => t.to)

      return Object.keys(txByAddress).map((address) => {
      return {value: txByAddress[address].length, address}
    }).filter(i  => i.value > 100)

  }, [txList])

  const byToken = useMemo(() => {
    const records = groupBy(txList, (tx) => tx.tokenSymbol )

    return Object.keys(records).map(token => {
      return {count: records[token].length, token}
    })

  }, [txList])


  return <span>
    <LineChart width={1400} height={600} data={txCountperBlock}>
      <YAxis />
      <XAxis dataKey={"block"} />
      <Line type="monotone" dataKey="txPerHalfDay" stroke="#8884d8" />
      <Line type="natural" dataKey="addresses" stroke="#FF9A51" />
      <Line type="natural" dataKey="trailingSTD" stroke="#000" />
      <Line type="monotone" dataKey="maxPerAddress" stroke="#7CC0FF" />
      <Line type="monotone" dataKey="meanTxPerAddress" stroke="#56DF7C" />
      <Line type="natural" dataKey="modeTxPerAddress" stroke="#FFA3EB" />
      <Line type="monotone" dataKey="medianTxPerAddress" stroke="#1E002B" />
      <Line type="monotone" dataKey="stdInTXPerAddress" stroke="#655947" />
      <Line type="monotone" dataKey="harmonicMean" stroke="#476520" />
      <Tooltip />
    </LineChart>

    <PieChart width={730} height={250}>
      <Pie dataKey={"value"} nameKey="address" data={countByAddress} cx="50%" cy="50%" outerRadius={80} label>
        {
          countByAddress.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]}  />
          ))
        }
      </Pie>
      <Tooltip />
    </PieChart>
    Most faucets {JSON.stringify(countByAddress)}

    <PieChart width={730} height={250}>
      <Pie dataKey={"count"} nameKey="token" data={byToken} cx="50%" cy="50%" outerRadius={80} label>
        {
          byToken.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]}  />
          ))
        }
      </Pie>
      <Tooltip />
    </PieChart>
  </span>
}

const colors = [
  "#1E002B",
  "#655947",
  "#476520",
  "#FCFF52",
  "#7CC0FF",
  "#FF9A51",
  "#FFA3EB",
  "#B490FF",
  "#56DF7C"

]

// Most faucets [{"value":2423,"address":"0x22579ca45ee22e2e16ddf72d955d6cf4c767b0ef"},{"value":2415,"address":"0xa7ed835288aa4524bb6c73dd23c0bf4315d9fe3e"},{"value":183,"address":"0xfa5b76d57c8072dbce64238be206e1eaee2252ab"},{"value":107,"address":"0x1035e8209cf8c8387604091cfdcabb7e8ba9c4a1"},{"value":132,"address":"0xbe8ba1b9e8fa91c01771f3404bec9970b6eace90"},{"value":243,"address":"0xeb5193c4663215ffcfb38f281e83cbf351a0d64f"},{"value":143,"address":"0x74f659955510917a630b75b613e86f85dba21845"},{"value":120,"address":"0xa153a3be9cb94d11e25fef70bd2b4c11c7e07a94"},{"value":271,"address":"0x28442a83acd17c2340fdbda807dd9783299c3ee1"}]
