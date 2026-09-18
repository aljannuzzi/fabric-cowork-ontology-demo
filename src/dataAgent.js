import { getCustomerRiskData, getAllCustomers } from "./db.js";
import { graphPathForRiskBrief } from "./ontology.js";

export async function listCustomers() {
  return getAllCustomers();
}

export async function buildCustomerRiskBrief(customerName = "Contoso Mobile") {
  const data = await getCustomerRiskData(customerName);
  if (!data) {
    return {
      found: false,
      answer: `No ontology-mapped customer matched "${customerName}".`,
      ontologyPath: graphPathForRiskBrief()
    };
  }

  const arr = data.subscriptions.reduce((sum, item) => sum + Number(item.arr_usd), 0);
  const openTickets = data.tickets.filter((ticket) => ticket.status !== "Closed");
  const slaBreaches = data.tickets.filter((ticket) => Boolean(ticket.sla_breached)).length;
  const latestUsage = data.usage[data.usage.length - 1];
  const firstUsage = data.usage[0];
  const usageGrowth = firstUsage && latestUsage
    ? ((Number(latestUsage.data_tb) - Number(firstUsage.data_tb)) / Number(firstUsage.data_tb)) * 100
    : 0;
  const nps = Number(data.renewal?.nps_score ?? 50);
  const riskScore = Math.min(99, Math.round(35 + openTickets.length * 10 + slaBreaches * 12 + Math.max(0, 40 - nps) + Math.max(0, usageGrowth - 20) / 2));
  const riskLevel = riskScore >= 75 ? "High" : riskScore >= 55 ? "Medium" : "Low";
  const products = data.subscriptions.map((item) => item.product_name).join(", ");

  const recommendation = riskLevel === "High"
    ? "Schedule an executive service review, commit a recovery plan for open SLA items, and position Premium SLA Care before renewal negotiations."
    : "Use the next account review to validate adoption, confirm renewal blockers, and package expansion options around current consumption.";

  return {
    found: true,
    customer: data.customer.customer_name,
    ontologyPath: graphPathForRiskBrief(),
    metrics: {
      riskLevel,
      riskScore,
      revenueExposureUsd: arr,
      renewalDate: data.renewal?.renewal_date,
      renewalStage: data.renewal?.stage,
      npsScore: nps,
      usageGrowthPercent: Math.round(usageGrowth),
      openTickets: openTickets.length,
      slaBreaches
    },
    evidence: {
      products,
      latestUsage,
      openTicketTopics: openTickets.map((ticket) => ticket.topic)
    },
    recommendation,
    answer:
      `${data.customer.customer_name} is at ${riskLevel.toLowerCase()} renewal risk. ` +
      `The ontology path Customer -> Subscription -> Product -> Usage -> Experience -> Renewal Risk shows ` +
      `$${(arr / 1000000).toFixed(1)}M ARR exposed, ${Math.round(usageGrowth)}% data-usage growth, ` +
      `${openTickets.length} open support tickets, ${slaBreaches} SLA breaches, and NPS ${nps}. ` +
      recommendation
  };
}

export async function answerBossEmail(emailText) {
  const match = String(emailText).match(/Contoso Mobile|Fabrikam Retail|Northwind Logistics/i);
  const customerName = match ? match[0] : "Contoso Mobile";
  const brief = await buildCustomerRiskBrief(customerName);

  return {
    emailIntent: "Boss is asking for an executive-ready customer risk and action summary.",
    selectedCustomer: customerName,
    dataAgentBrief: brief,
    draftReply:
      `I checked the ontology-backed customer intelligence view for ${customerName}. ` +
      `${brief.answer} I recommend we reply with the risk level, revenue exposure, operational drivers, and the immediate executive action plan.`
  };
}
