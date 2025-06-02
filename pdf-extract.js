const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const { DocxLoader } = require("@langchain/community/document_loaders/fs/docx");
const z = require("zod");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { ChatOpenAI } = require("@langchain/openai");

// Updated Sales Proposal Schema
const salesProposalSchema = z.object({
  customer: z.string().describe("Name of the client or customer"),
  industry: z.string().describe("Industry sector of the customer (e.g., Insurance, Banking, Retail)"),
  projectTitle: z.string().optional().describe("Title of the sales proposal or project"),
  date: z.string().optional().describe("Date of the proposal"),
  objectives: z.string().describe("Detailed narrative of the project objectives using the original document's language and tone"),
  scope: z.string().describe("Detailed narrative of the project scope using the original document's language and tone"),
  technologies: z.string().describe("Detailed narrative of all technologies, platforms, and tools involved, using original business language"),
  solutionSummary: z.string().describe("Summary of the proposed solution"),
});

// Updated Prompt
const SALES_PROPOSAL_PROMPT = `
Eres un experto en extraer información estructurada a partir de propuestas comerciales empresariales redactadas en español.

Tu tarea consiste en analizar el documento y extraer los siguientes campos utilizando narrativa detallada (sin listas), manteniendo el tono técnico y profesional utilizado en la propuesta original:

1. Nombre del cliente.
2. Sector o industria del cliente (por ejemplo: Seguros, Banca, Retail).
3. Título del proyecto y versión, si está disponible.
4. Fecha de la propuesta.
5. Una descripción formal y precisa de los objetivos específicos del proyecto dirigidos al cliente. No incluyas información sobre la experiencia, cultura, valores, clientes, equipos, certificaciones o posicionamiento de la empresa proveedora. Solo detalla lo que se pretende lograr para el cliente, tal como está indicado en la propuesta.
6. Una explicación detallada del alcance del proyecto.
7. Un párrafo que describa las tecnologías, plataformas y herramientas involucradas (normaliza nombres como Power BI, Java, SISnet360, APIs, etc.), en el contexto del proyecto.
8. Un resumen conciso de la solución propuesta.

Todos los textos extraídos deben estar redactados en español. Evita viñetas o listas. 
Devuelve el resultado en formato JSON estructurado.
`;

function hashStringToNumber(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

async function loadDocument(docPath) {
  const response = await fetch(docPath);
  const blob = await response.blob();
  let docs = [];

  try {
    const pdfLoader = new PDFLoader(blob, { splitPages: false });
    docs = await pdfLoader.load();
  } catch (pdfError) {
    console.warn("Failed to load as PDF, attempting to load as Word document:", pdfError);
    try {
      const loader = new DocxLoader(blob);
      docs = await loader.load();
    } catch (wordError) {
      console.error("Failed to load as Word document:", wordError);
      throw new Error("Unsupported document format or failed to load document");
    }
  }

  return docs;
}

async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const { pdfpath, docname } = req.body;

      const docs = await loadDocument(pdfpath);

      if (docs.length === 0) {
        console.log("No documents found.");
        return res.status(400).json({ message: "No documents found" });
      }

      const prompt = ChatPromptTemplate.fromMessages([
        ["system", SALES_PROPOSAL_PROMPT],
        ["human", docs[0].pageContent],
      ]);

      const llm = new ChatOpenAI({
        modelName: process.env["OPENAI_MODEL"],
        temperature: 0,
      });

      const extractionRunnable = prompt.pipe(
        llm.withStructuredOutput(salesProposalSchema, { name: "sales_proposal" })
      );

      const extract = await extractionRunnable.invoke({
        text: docs[0].pageContent,
      });

      return res.status(200).json(extract);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  } else {
    res.status(405).json({ message: "Method not allowed" });
  }
}

module.exports = handler;


