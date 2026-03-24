// OmniStock Shared Types

export type MovementType = 
  | 'purchase_receipt'
  | 'issue_to_outlet'
  | 'transfer_out'
  | 'transfer_in'
  | 'adjustment_plus'
  | 'adjustment_minus'
  | 'expired_writeoff';

export type ReferenceType = 
  | 'goods_receipt'
  | 'stock_issue'
  | 'transfer'
  | 'stock_adjustment';

export type Status = 'draft' | 'posted' | 'cancelled' | 'approved' | 'dispatched' | 'received';

export interface Item {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  category_id: number;
  base_unit_id: number;
  is_perishable: boolean;
  track_batches: boolean;
  track_expiry: boolean;
  reorder_level: number;
  min_stock: number;
  max_stock: number;
  is_active: boolean;
}

export interface Unit {
  id: number;
  code: string;
  name: string;
}

export interface UnitConversion {
  id: number;
  item_id: string;
  from_unit_id: number;
  to_unit_id: number;
  multiplier: number;
}

export interface Godown {
  id: string;
  code: string;
  name: string;
  address?: string;
  is_active: boolean;
}

export interface Outlet {
  id: string;
  code: string;
  name: string;
  address?: string;
  manager_id?: string;
  is_active: boolean;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  is_active: boolean;
}

export interface StockBatch {
  id: string;
  item_id: string;
  godown_id: string;
  batch_number: string;
  manufacture_date?: string;
  expiry_date?: string;
  received_quantity: number;
  current_quantity: number;
  reserved_quantity: number;
  initial_cost: number;
  current_cost: number;
  status: 'active' | 'depleted' | 'expired' | 'blocked';
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  movement_type: MovementType;
  reference_type: ReferenceType;
  reference_id: string;
  item_id: string;
  batch_id?: string;
  godown_id?: string;
  source_godown_id?: string;
  destination_godown_id?: string;
  destination_outlet_id?: string;
  entered_quantity: number;
  entered_unit_id?: number;
  base_quantity: number;
  unit_cost?: number;
  total_value?: number;
  movement_date: string;
  created_by: string;
  remarks?: string;
  created_at: string;
}

export interface GoodsReceipt {
  id: string;
  grn_number: string;
  supplier_id: string;
  purchase_order_reference?: string;
  invoice_number?: string;
  invoice_date?: string;
  received_date: string;
  godown_id: string;
  storage_location_id?: string;
  remarks?: string;
  status: Status;
  created_by: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
  posted_at?: string;
  cancelled_at?: string;
}

export interface GoodsReceiptItem {
  id: string;
  goods_receipt_id: string;
  item_id: string;
  entered_quantity: number;
  entered_unit_id: number;
  base_quantity: number;
  batch_number?: string;
  manufacture_date?: string;
  expiry_date?: string;
  unit_cost: number;
  tax_amount: number;
  other_charges: number;
  total_line_cost: number;
  remarks?: string;
}

export interface StockIssue {
  id: string;
  issue_number: string;
  source_godown_id: string;
  outlet_id: string;
  request_reference?: string;
  issue_date: string;
  remarks?: string;
  status: Status;
  created_by: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
  posted_at?: string;
  cancelled_at?: string;
}

export interface StockIssueItem {
  id: string;
  stock_issue_id: string;
  item_id: string;
  requested_quantity: number;
  issued_quantity: number;
  entered_unit_id: number;
  base_quantity: number;
  unit_cost: number;
  total_cost: number;
  remarks?: string;
}

export interface StockIssueBatchAllocation {
  id: string;
  stock_issue_item_id: string;
  batch_id: string;
  allocated_quantity: number;
  allocated_base_quantity: number;
}

export interface Transfer {
  id: string;
  transfer_number: string;
  source_godown_id: string;
  destination_godown_id: string;
  transfer_date: string;
  remarks?: string;
  status: Status;
  created_by: string;
  approved_by?: string;
  dispatched_by?: string;
  received_by?: string;
  created_at: string;
  updated_at: string;
  dispatched_at?: string;
  received_at?: string;
  cancelled_at?: string;
}

export interface TransferItem {
  id: string;
  transfer_id: string;
  item_id: string;
  entered_quantity: number;
  entered_unit_id: number;
  base_quantity: number;
  remarks?: string;
}

export interface TransferBatchAllocation {
  id: string;
  transfer_item_id: string;
  batch_id: string;
  allocated_quantity: number;
  allocated_base_quantity: number;
}

export interface StockAdjustment {
  id: string;
  adjustment_number: string;
  godown_id: string;
  adjustment_date: string;
  reason: string;
  remarks?: string;
  status: Status;
  created_by: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
  posted_at?: string;
  cancelled_at?: string;
}

export interface StockAdjustmentItem {
  id: string;
  stock_adjustment_id: string;
  item_id: string;
  batch_id?: string;
  direction: 'in' | 'out';
  entered_quantity: number;
  entered_unit_id: number;
  base_quantity: number;
  unit_cost?: number;
  total_cost?: number;
  remarks?: string;
}

export interface StockCountSession {
  id: string;
  session_number: string;
  godown_id: string;
  storage_location_id?: string;
  count_date: string;
  status: 'draft' | 'in_progress' | 'submitted' | 'approved' | 'posted' | 'cancelled';
  remarks?: string;
  created_by: string;
  approved_by?: string;
  posted_at?: string;
  cancelled_at?: string;
  created_at: string;
  updated_at: string;
}

export interface StockCountItem {
  id: string;
  stock_count_session_id: string;
  item_id: string;
  batch_id?: string;
  system_quantity: number;
  counted_quantity: number;
  variance_quantity: number;
  entered_unit_id?: number;
  base_variance_quantity: number;
  unit_cost?: number;
  variance_value?: number;
  remarks?: string;
  created_at: string;
}

export interface WastageRecord {
  id: string;
  wastage_number: string;
  godown_id: string;
  wastage_date: string;
  reason: string;
  remarks?: string;
  status: 'draft' | 'posted' | 'cancelled';
  created_by: string;
  approved_by?: string;
  posted_at?: string;
  cancelled_at?: string;
  created_at: string;
  updated_at: string;
}

export interface WastageRecordItem {
  id: string;
  wastage_record_id: string;
  item_id: string;
  batch_id?: string;
  quantity: number;
  entered_unit_id: number;
  base_quantity: number;
  unit_cost: number;
  total_cost: number;
  reason_detail?: string;
  remarks?: string;
}

export interface InventoryBalanceSummary {
  id: string;
  item_id: string;
  godown_id: string;
  storage_location_id?: string;
  batch_id?: string;
  quantity_on_hand: number;
  reserved_quantity: number;
  average_unit_cost?: number;
  updated_at: string;
}

export interface ItemBarcode {
  id: string;
  item_id: string;
  barcode: string;
  barcode_type: 'primary' | 'secondary' | 'packaging';
  created_at: string;
}

export interface BatchBarcode {
  id: string;
  batch_id: string;
  barcode: string;
  created_at: string;
}

export interface SalesDocument {
  id: string;
  outlet_id: string;
  sale_date: string;
  reference_number: string;
  status: 'draft' | 'posted' | 'cancelled';
  total_sales_value: number;
  created_by: string;
  created_at: string;
}

export interface SalesDocumentItem {
  id: string;
  sales_document_id: string;
  item_id: string;
  quantity: number;
  sales_price: number;
  net_sales_value: number;
  linked_cost_value?: number;
  created_at: string;
}

export interface SmartAlert {
  id: string;
  type: 'low_stock_forecast' | 'expiry_risk' | 'unusual_issue' | 'high_wastage' | 'shrinkage' | 'dead_stock' | 'margin_drop' | 'outlet_anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  affected_id: string; // item_id, godown_id, or outlet_id
  affected_name: string;
  reason: string;
  supporting_data: any;
  suggested_action: string;
  generated_at: string;
}

export interface StockRequest {
  id: string;
  request_number: string;
  outlet_id: string;
  requested_date: string;
  status: 'draft' | 'submitted' | 'approved' | 'partially_fulfilled' | 'fulfilled' | 'cancelled';
  remarks?: string;
  created_by: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
  items: StockRequestItem[];
}

export interface StockRequestItem {
  id: string;
  stock_request_id: string;
  item_id: string;
  requested_quantity: number;
  approved_quantity: number;
  fulfilled_quantity: number;
  remarks?: string;
}

export interface Attachment {
  id: string;
  entity_type: 'grn' | 'wastage' | 'transfer' | 'stock_count' | 'request';
  entity_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'high_wastage' | 'expiry_risk' | 'low_stock' | 'pending_approval' | 'discrepancy' | 'transfer_delay';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  related_entity_type?: string;
  related_entity_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface FinanceSummary {
  revenue: number;
  cogs: number;
  wastageLoss: number;
  grossProfit: number;
  netProfit: number;
  marginPercentage: number;
  period: string;
}
