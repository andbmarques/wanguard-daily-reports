// Importa a biblioteca de Váriaveis de Ambiente (.env)
import dotenv from "dotenv";
dotenv.config();

// Importa outras bibliotecas
import moment from "moment";
import PdfPrinter from "pdfmake";
import fs from "fs";
import prettyBytes from "pretty-bytes";

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

// Define a função que irá converter o PDF para Base64
async function convertPdfToBase64(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const base64String = fileBuffer.toString("base64");

    return base64String;
  } catch (error) {
    console.error("Erro ao converter o PDF para Base64:", error);
    throw error;
  }
}

// Define a função de requisição das anomalias
const fetchData = async () => {
  const previousDate = `${moment()
    .subtract(1, "days")
    .format("YYYY-MM-DD")}T21:00:00.000Z`;
  const currentDate = `${moment().format("YYYY-MM-DD")}T21:00:00.000Z`;

  try {
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
      .then((data) => {
        if (data) anomalies = data;
      })
      .finally(() =>
        console.log(
          `${moment().format("DD-MM-YYYY")} | Anomalias capturadas com sucesso!`
        )
      );
  } catch (error) {
    console.log(
      `${moment().format("DD-MM-YYYY")} | Erro ao capturar anomalias`
    );
  }
};

// Define a função que irá criar o PDF
const generatePdf = (data, callback) => {
  let tableData = [];

  if (data)
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
    header: function (page, pages) {
      if (page !== 1) {
        return {
          text: `Relatório de Anomalias - ${
            process.env.CUSTOMER
          } - ${moment().format("DD/MM/YYYY")}`,
          alignment: "center",
          margin: [0, 10, 0, 10],
        };
      }
    },
    footer: function (page, pages) {
      return {
        columns: [
          {
            text: `${page.toString()}/${pages}`,
            alignment: "right",
            margin: [0, 10, 10, 0],
          },
        ],
      };
    },
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
      !data ? {
        text: "Nenhuma anomalia foi detectada no período de 24 horas.",
        style: "header",
        alignment: "center",
        fontSize: 20,
        margin: [0, 10, 0, 10],
      } : {},
      data ? {
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
      } : {},

      { image: "./assets/logo-branca.png", width: 250, alignment: "center" },
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
  console.log(`${moment().format("DD-MM-YYYY")} | PDF Gerado com sucesso`);
};

// Define a função principal
const main = async () => {
  // Faz a requisição a API do Wanguard
  await fetchData();

  // Gera o pdf a partir das anomalias
  await generatePdf(anomalies);

  // Define a váriavel que irá receber a String Base64 do pdf
  let b64;

  // Define um tempo de espera de 5s para executar os comandos a seguir
  setTimeout(async () => {
    try {
      // Faz a conversão do PDF para Base64
      b64 = await convertPdfToBase64(
        `./${process.env.CUSTOMER}-Anomalias-${moment().format("DD-MM-YYYY")}`
      );

      // Deleta o arquivo PDF temporário
      await fs.unlinkSync(
        `${process.env.CUSTOMER}-Anomalias-${moment().format("DD-MM-YYYY")}`
      );

      console.log(
        `${moment().format(
          "DD-MM-YYYY"
        )} | Base64 Gerado e PDF Temporário Excluido`
      );
    } catch (error) {
      console.log(
        `${moment().format(
          "DD-MM-YYYY"
        )} | Erro ao gerar Base64 e/ou Excluir PDF Temporário`
      );
    }

    try {
      // Envia o documento para o Whatsapp através da api do Waseller
      await fetch(
        `https://api-whatsapp.wascript.com.br/api/enviar-documento/${process.env.API_TOKEN}`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone: process.env.CUSTOMER_NUMBER,
            base64: `data:application/pdf;base64,${b64}`,
            name: `${process.env.CUSTOMER}-Anomalias-${moment().format(
              "DD-MM-YYYY"
            )}`,
          }),
        }
      ).finally(() => console.log(
        `${moment().format(
          "DD-MM-YYYY"
        )} | Sucesso ao realizar envio para Whatsapp`
      ));
    } catch (error) {
      console.log(
        `${moment().format(
          "DD-MM-YYYY"
        )} | Erro ao realizar envio para Whatsapp`
      );
    }
  }, 5000);
};

// Chama a função principal
main();
