export type AgentType = 
  | 'inventory-agent' 
  | 'knowledge-agent' 
  | 'sales-agent' 
  | 'voice-agent' 
  | 'fulfillment-agent' 
  | 'finance-agent';

export interface AgentRequest<T = any> {
  from: AgentType | string;
  to: AgentType;
  action: string;
  context: {
    clientId: string;
    clientName?: string;
    lastMessage?: string;
    [key: string]: any;
  };
  data?: T;
}

export interface AgentResponse<T = any> {
  from: AgentType;
  to: AgentType | string;
  status: 'SUCCESS' | 'ERROR' | 'REQUIRES_USER_INPUT' | 'REJECTED' | 'WAITLIST' | 'PENDING';
  data: T;
  message?: string;
}
