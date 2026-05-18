import { EmotionalState } from '../value-objects/emotional-state.vo';

export interface BillingData {
  documentType: 'CC' | 'NIT' | 'CE' | 'PP' | 'DUMMY';
  documentNumber: string;
  fullName: string;
  email: string;
  address: string;
  city: string;
  phone: string;
}

export interface ClientProps {
  id: string; // WhatsApp number or ID
  name: string; // From WhatsApp profile
  phone: string;
  lid?: string; // Technical WhatsApp ID (LID)
  fullName?: string; // Real full name
  documentType?: 'CC' | 'NIT' | 'CE' | 'PP' | 'DUMMY';
  documentNumber?: string;
  email?: string;
  address?: string;
  city?: string;
  registrationSource?: string; // Ej: 'LINK_PAGE', 'DIRECT', etc.
  metadata?: Record<string, any>;
  createdAt: Date;
}

export class Client {
  private readonly props: ClientProps;

  constructor(props: ClientProps) {
    this.props = {
      ...props,
      createdAt: props.createdAt || new Date(),
    };
  }

  get id(): string { return this.props.id; }
  get name(): string { return this.props.name; }
  get phone(): string { return this.props.phone; }
  get lid(): string | undefined { return this.props.lid; }
  get fullName(): string | undefined { return this.props.fullName; }
  get documentType(): string | undefined { return this.props.documentType; }
  get documentNumber(): string | undefined { return this.props.documentNumber; }
  get email(): string | undefined { return this.props.email; }
  get address(): string | undefined { return this.props.address; }
  get city(): string | undefined { return this.props.city; }
  get registrationSource(): string | undefined { return this.props.registrationSource; }
  get metadata(): Record<string, any> | undefined { return this.props.metadata; }
  get createdAt(): Date { return this.props.createdAt; }

  static create(id: string, name: string, phone: string, lid?: string): Client {
    return new Client({
      id,
      name,
      phone,
      lid,
      createdAt: new Date(),
    });
  }

  updateName(name: string): void {
    this.props.name = name;
  }

  updateProfile(data: Partial<Pick<ClientProps, 'fullName' | 'documentType' | 'documentNumber' | 'email' | 'address' | 'city' | 'registrationSource' | 'lid'>>): void {
    Object.assign(this.props, data);
  }
}
