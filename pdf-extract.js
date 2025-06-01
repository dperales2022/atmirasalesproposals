const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const { DocxLoader } = require("@langchain/community/document_loaders/fs/docx");
const z = require("zod");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { ChatOpenAI } = require("@langchain/openai");

// Sales Proposal Schema
const salesProposalSchema = z.object({
  customer: z.string().describe("Name of the client or customer"),
  industry: z.string().describe("Industry sector of the customer (e.g., Insurance, Banking, Retail)"),
  projectTitle: z.string().optional().describe("Title of the sales proposal or project"),
  date: z.string().optional().describe("Date of the proposal"),
  objectives: z.array(z.string()).describe("List of project or business objectives described in the proposal"),
  scope: z.array(z.string()).describe("Scope of the project or services to be provided"),
  technologies: z.array(z.string()).describe("List of technologies, platforms, or tools proposed"),
  solutionSummary: z.string().describe("Summary of the proposed solution"),
});

// Prompt for sales proposals
const SALES_PROPOSAL_PROMPT = `
You are an expert in extracting structured information from business sales proposals.

Your task is to extract the following:
1. The customer name.
2. The customer's industry (e.g., Insurance, Banking, Retail).
3. Project title and version if available.
4. The date of the proposal.
5. Project objectives and scope.
6. Summary of the proposed solution and the technologies mentioned.

Please normalize technology names (e.g., Power BI, JavaScript, .NET) and clean the extracted data. If a field is not available, omit it.
Return the result as structured JSON.
`;

// Simple hash function to generate a number from a string
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
