export type AgentType = 'fresquitoh-orchestrator' | 'inventory-agent' | 'finance-agent' | 'knowledge-agent' | 'fulfillment-agent';

export interface AgentRequest<T = any> {
  from: AgentType;
  to: AgentType;
  action: string;
  context: {
    clientId: string;
    [key: string]: any;
  };
  data?: T;
}

export interface AgentResponse<T = any> {
  from: AgentType;
  to: AgentType;
  status: 'SUCCESS' | 'ERROR' | 'REQUIRES_USER_INPUT' | 'WAITLIST' | 'PENDING';
  data: T;
  suggestedReply?: string;
}

export interface InventoryCheckData {
  productName: string;
  requestedQuantity: number;
}

export interface InventoryCheckResult {
  available: boolean;
  productName: string;
  currentStock?: number;
  pricePerUnit: number;
  totalPrice?: number;
  reservationId?: string;
  unitsNeeded?: number;
  presentation?: string;
  packaging?: string;
  totalGrams?: number;
  currency?: string;
}
