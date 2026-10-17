/**
 * 数据库类型定义，与 supabase/migrations 中的表结构保持一致。
 * 修改表结构时请同步修改这里。
 */

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "picked_up"
  | "returned"
  | "cancelled";

export type InventoryStatus = "available" | "inactive";

export type StyleCategory = "suit" | "one_piece" | "jacket" | "pants";

export type Database = {
  public: {
    Tables: {
      settings: {
        Row: {
          id: boolean;
          buffer_days: number;
          max_rental_days: number;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          buffer_days?: number;
          max_rental_days?: number;
          updated_at?: string;
        };
        Update: {
          buffer_days?: number;
          max_rental_days?: number;
        };
        Relationships: [];
      };
      styles: {
        Row: {
          id: string;
          slug: string;
          brand: string;
          category: StyleCategory;
          name: string;
          description: string;
          daily_price_cents: number;
          deposit_cents: number;
          image_urls: string[];
          source_url: string;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          brand?: string;
          category?: StyleCategory;
          name: string;
          description?: string;
          daily_price_cents: number;
          deposit_cents: number;
          image_urls?: string[];
          source_url?: string;
          is_active?: boolean;
          sort_order?: number;
        };
        Update: {
          slug?: string;
          brand?: string;
          category?: StyleCategory;
          name?: string;
          description?: string;
          daily_price_cents?: number;
          deposit_cents?: number;
          image_urls?: string[];
          source_url?: string;
          is_active?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      inventory_items: {
        Row: {
          id: string;
          style_id: string;
          size: string;
          code: string;
          status: InventoryStatus;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          style_id: string;
          size: string;
          code: string;
          status?: InventoryStatus;
          notes?: string;
        };
        Update: {
          size?: string;
          code?: string;
          status?: InventoryStatus;
          notes?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_items_style_id_fkey";
            columns: ["style_id"];
            isOneToOne: false;
            referencedRelation: "styles";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          id: string;
          booking_no: string;
          style_id: string;
          inventory_item_id: string;
          size: string;
          start_date: string;
          end_date: string;
          buffer_days: number;
          blocked_range: string;
          status: BookingStatus;
          fulfillment_method: "pickup" | "shipping";
          shipping_address: string | null;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          customer_note: string;
          rental_days: number;
          daily_price_cents: number;
          rental_cents: number;
          deposit_cents: number;
          total_cents: number;
          admin_note: string;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          status?: BookingStatus;
          admin_note?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_style_id_fkey";
            columns: ["style_id"];
            isOneToOne: false;
            referencedRelation: "styles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_users: {
        Row: {
          user_id: string;
          email: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      get_availability: {
        Args: {
          p_start?: string | null;
          p_end?: string | null;
          p_style_id?: string | null;
        };
        Returns: {
          style_id: string;
          size: string;
          total_count: number;
          available_count: number;
        }[];
      };
      create_booking: {
        Args: {
          p_style_id: string;
          p_size: string;
          p_start: string;
          p_end: string;
          p_customer_name: string;
          p_customer_email: string;
          p_customer_phone: string;
          p_fulfillment_method: "pickup" | "shipping";
          p_shipping_address: string | null;
          p_customer_note: string;
          p_daily_price_cents: number;
          p_rental_cents: number;
          p_deposit_cents: number;
        };
        Returns: {
          booking_id: string;
          booking_no: string;
          inventory_item_id: string;
        }[];
      };
      hit_rate_limit: {
        Args: {
          p_bucket: string;
          p_key_hash: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
      is_admin: {
        Args: Record<never, never>;
        Returns: boolean;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type StyleRow = Database["public"]["Tables"]["styles"]["Row"];
export type InventoryItemRow = Database["public"]["Tables"]["inventory_items"]["Row"];
export type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
