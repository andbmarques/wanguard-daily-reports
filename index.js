// Importa a biblioteca de Váriaveis de Ambiente (.env)
import dotenv from "dotenv";
dotenv.config();

// Importa outras bibliotecas
import moment from "moment";
import PdfPrinter from "pdfmake";
import fs from "fs";
import prettyBytes from "pretty-bytes";
import { Client } from "basic-ftp";

// Define as fontes usadas no PDF
let fonts = {
  Roboto: {
    normal: "./assets/Roboto-Regular.ttf",
    bold: "./assets/Roboto-Medium.ttf",
  },
};

// Instancia a biblioteca PdfMake
let printer = new PdfPrinter(fonts);

// Define a váriavel que irá receber as anomalias
let anomalies;

// Define a função para formatar o número de pacotes
const formatPackets = (value) => {
  return prettyBytes(value)
    .replace("B", "Pkts")
    .replace("kB", "Kpkts")
    .replace("MB", "Mpkts")
    .replace("GB", "Gpkts");
};

// Define a função de requisição das anomalias
const fetchData = async () => {
  const previousDate = `${moment()
    .subtract(1, "days")
    .format("YYYY-MM-DD")}T21:00:00.000Z`;
  const currentDate = `${moment().format("YYYY-MM-DD")}T21:00:00.000Z`;

  await fetch(
    `http://${process.env.WANGUARD_ADDR}/wanguard-api/v1/anomalies?from=%3E%3D${previousDate}&until=%3C%3D${currentDate}&fields=anomaly_id%2Cprefix%2Cip_group%2Canomaly%2Cunit%2Cfrom%2Cduration%2Cpkts%2Fs%2Cbits%2Fs`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${btoa(
          `${process.env.WANGUARD_USER}:${process.env.WANGUARD_PASS}`
        )}`,
      },
    }
  )
    .then((res) => res.json())
    .then((data) => (anomalies = data));
};

// Define a função que irá criar o PDF
const generatePdf = (data) => {
  let tableData = [];

  for (const item of data) {
    tableData.push([
      { text: item.anomaly_id, fontSize: 10 },
      { text: item.ip_group, fontSize: 8 },
      { text: item.prefix, fontSize: 10 },
      { text: item.anomaly, fontSize: 10 },
      { text: item.duration + "s", fontSize: 10 },
      { text: item.from.iso_8601, fontSize: 8 },
      { text: formatPackets(Number(item["pkts/s"])), fontSize: 10 },
      {
        text: prettyBytes(Number(item["bits/s"]), { bits: true }),
        fontSize: 10,
      },
    ]);
  }

  let docDefinition = {
    content: [
      {
        alignment: "center",
        columns: [
          { image: "./assets/logo-branca.png", width: 150 },
          {
            margin: [0, 40, 0, 0],
            text: `Relatório de Anomalias - ${
              process.env.CUSTOMER
            } - ${moment().format("DD/MM/YYYY")}`,
            style: "header",
          },
        ],
      },
      {
        style: "defaultTable",
        layout: {
          fillColor: function (rowIndex, node, columnIndex) {
            return rowIndex % 2 === 0 ? "#EEEEEE" : null;
          },
        },
        table: {
          headerRows: 1,
          widths: [35, 50, 95, 65, 45, 50, 50, 50],

          body: [
            [
              { text: "ID", style: "tableHeader" },
              { text: "Grupo IP", style: "tableHeader" },
              { text: "Prefixo", style: "tableHeader" },
              { text: "Anomalia", style: "tableHeader" },
              { text: "Duração", style: "tableHeader" },
              { text: "Início", style: "tableHeader" },
              { text: "Pacotes", style: "tableHeader" },
              { text: "Bits", style: "tableHeader" },
            ],

            ...tableData,
          ],
        },
      },
    ],
  };

  let options = {};

  let pdfDoc = printer.createPdfKitDocument(docDefinition, options);
  pdfDoc.pipe(
    fs.createWriteStream(
      `${process.env.CUSTOMER}-Anomalias-${moment().format("DD-MM-YYYY")}`
    )
  );
  pdfDoc.end();
};

// Define a função principal
const main = async () => {
  await fetchData();
  //console.log(anomalies);
  generatePdf(anomalies);

  // Instancia o cliente FTP
  const client = new Client();

  try {
    await client.access({
      host: process.env.FTP_ADDR,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS
    })
    
    await client.ensureDir(`Relatorios/${moment().format("DD-MM-YYYY")}`)
    await client.uploadFrom(`${process.env.CUSTOMER}-Anomalias-${moment().format("DD-MM-YYYY")}`, `${process.env.CUSTOMER}-Anomalias-${moment().format("DD-MM-YYYY")}`)
  } catch (error) {
    console.log(error)
  }

  client.close()

  await fs.unlinkSync(`${process.env.CUSTOMER}-Anomalias-${moment().format("DD-MM-YYYY")}`)
};

// Chama a função principal
main();
