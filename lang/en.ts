// lang/en.ts

const langEng = {
  appDetails: {
    name: "KR Customizer",
    email: "support@krcustomizer.com",
    domain: "https://krcustomizer.com",
    storeFrontUrl: process.env.CUSTOMIZER_FRONTEND_URL || "https://front.krcustomizer.com/",
  },
  storeApi: {
    endPoint: process.env.STORE_API_ENDPOINT || "https://backend.krcustomizer.com/api/",
    token: process.env.STORE_API_TOKEN || "kusheldigi-admin",
  },
  modifierDisplayNames: {
    designId: "Design Id",
    viewDesign: "View Design",
    designArea: "Design Area",
  },
};

export default langEng;
