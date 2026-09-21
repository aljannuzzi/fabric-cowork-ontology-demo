export const ontology = {
  name: "NovaTel Enterprise Customer Intelligence",
  description:
    "Fabric IQ-style ontology that maps telco customers to products, usage, experience, renewals, and recommended retention actions.",
  nodes: [
    { id: "Customer", label: "Customer", table: "customers", x: 90, y: 210 },
    { id: "Subscription", label: "Subscription", table: "subscriptions", x: 290, y: 210 },
    { id: "Product", label: "Product", table: "products", x: 500, y: 120 },
    { id: "Usage", label: "Usage", table: "usage_metrics", x: 500, y: 300 },
    { id: "Experience", label: "Experience", table: "support_tickets", x: 720, y: 300 },
    { id: "RenewalRisk", label: "Renewal Risk", table: "renewals", x: 720, y: 120 },
    { id: "Action", label: "Recommended Action", table: "agent_inference", x: 950, y: 210 }
  ],
  edges: [
    { from: "Customer", to: "Subscription", verb: "owns" },
    { from: "Subscription", to: "Product", verb: "contains" },
    { from: "Subscription", to: "Usage", verb: "generates" },
    { from: "Usage", to: "Experience", verb: "affects" },
    { from: "Experience", to: "RenewalRisk", verb: "increases" },
    { from: "RenewalRisk", to: "Action", verb: "drives" },
    { from: "Product", to: "Action", verb: "suggests expansion" }
  ],
  semanticMappings: [
    {
      concept: "Customer",
      fields: ["customers.customer_name", "customers.segment", "customers.industry"]
    },
    {
      concept: "Revenue Exposure",
      fields: ["subscriptions.arr_usd", "renewals.renewal_date", "renewals.stage"]
    },
    {
      concept: "Experience Health",
      fields: ["support_tickets.severity", "support_tickets.status", "support_tickets.sla_breached"]
    },
    {
      concept: "Consumption Trend",
      fields: ["usage_metrics.data_tb", "usage_metrics.roaming_gb", "usage_metrics.month"]
    }
  ]
};

export function graphPathForRiskBrief() {
  return [
    "Customer",
    "Subscription",
    "Product",
    "Usage",
    "Experience",
    "RenewalRisk",
    "Action"
  ];
}
