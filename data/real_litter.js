// Real litter-related 311 service-request data (fetched from open-data APIs).
// NYC / Chicago: trailing 12 months via Socrata (queried 2026-10-17)
// LA: MyLA311 2025 dataset (Illegal Dumping Pickup)
// Toronto: City of Toronto "311 Service Requests 2025" (ward-level)
window.PJJ_REAL_311 = {
  cities: {
    "New York": {
      reports: 123508,
      cityPop: 8258035,
      period: "Oct 2025 - Oct 2026",
      types: "Dirty Condition, Illegal Dumping, Litter Basket, Dumpster Complaint",
      source: "NYC 311 Open Data (Socrata erm2-nwe9)",
    },
    "Chicago": {
      reports: 91591,
      cityPop: 2664452,
      period: "Oct 2025 - Oct 2026",
      types: "Sanitation Code Violation, Garbage Cart Maintenance, Fly Dumping",
      source: "Chicago 311 Service Requests (Socrata v6vf-nfxy)",
    },
    "Los Angeles": {
      reports: 32751,
      cityPop: 3898747,
      period: "2025",
      types: "Illegal Dumping Pickup",
      source: "MyLA311 Service Request Data 2025 (Socrata h73f-gn57)",
    },
    "Toronto": {
      reports: 42480,
      cityPop: 2794356,
      period: "2025",
      types: "Litter bins, illegal dumping, missed collection, cleanup requests",
      source: "City of Toronto 311 Service Requests 2025",
    },
  },
  // Toronto ward-level counts, keyed by ward AREA_SHORT_CODE ("01".."25")
  torontoWards: {
    "01": 1019,
    "02": 1236,
    "03": 1538,
    "04": 1584,
    "05": 1441,
    "06": 1380,
    "07": 1355,
    "08": 1731,
    "09": 1790,
    "10": 1502,
    "11": 2264,
    "12": 1239,
    "13": 2172,
    "14": 3227,
    "15": 1669,
    "16": 853,
    "17": 1216,
    "18": 1507,
    "19": 2909,
    "20": 2883,
    "21": 1755,
    "22": 1161,
    "23": 1197,
    "24": 1491,
    "25": 2361,
  },
  wardSource: "City of Toronto 311 Service Requests 2025 (ward-level)",
};