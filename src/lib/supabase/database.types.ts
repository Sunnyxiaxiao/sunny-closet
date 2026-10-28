/**
 * Database types, kept in sync with the table definitions in supabase/migrations.
 * Update this file whenever the schema changes.
 */

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "picked_up"
  | "returned"
  | "cancelled";

export type InventoryStatus = "available" | "inactive";

export type StyleCategory = "suit" | "one_piece" | "jacket" | "pants" | "helmet_cover" | "gloves";

export type HelmetCoverTier = "regular" | "premium";

export type ReviewStatus = "pending" | "published" | "hidden";

export type Database = {
  public: {
    Tables: {
      settings: {
        Row: {
          id: boolean;
          buffer_days: number;
          gloves_max_rental_days: number;
          max_rental_days: number;
          rental_prices_cents: number[];
          jacket_prices_cents: number[];
          pants_prices_cents: number[];
          /** Regular price table for Crystal outfits; during the promotion (today ≤ crystal_promo_ends_on) standard prices apply */
          crystal_prices_cents: number[];
          crystal_jacket_prices_cents: number[];
          crystal_pants_prices_cents: number[];
          crystal_promo_ends_on: string | null;
          shipping_min_days: number;
          /** Extra days of inventory occupied around the ski days (not billed): local pickup the evening before and return the next day; shipping goes out early and comes back after */
          pickup_lead_days: number;
          pickup_tail_days: number;
          shipping_lead_days: number;
          shipping_tail_days: number;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          buffer_days?: number;
          gloves_max_rental_days?: number;
          max_rental_days?: number;
          rental_prices_cents?: number[];
          jacket_prices_cents?: number[];
          pants_prices_cents?: number[];
          crystal_prices_cents?: number[];
          crystal_jacket_prices_cents?: number[];
          crystal_pants_prices_cents?: number[];
          crystal_promo_ends_on?: string | null;
          shipping_min_days?: number;
          updated_at?: string;
        };
        Update: {
          buffer_days?: number;
          gloves_max_rental_days?: number;
          max_rental_days?: number;
          rental_prices_cents?: number[];
          jacket_prices_cents?: number[];
          pants_prices_cents?: number[];
          crystal_prices_cents?: number[];
          crystal_jacket_prices_cents?: number[];
          crystal_pants_prices_cents?: number[];
          crystal_promo_ends_on?: string | null;
          shipping_min_days?: number;
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
          tier: HelmetCoverTier | null;
          tags: string[];
          addon_price_cents: number | null;
          replacement_value_cents: number | null;
          /** When set, the style is priced by its own table; otherwise by the shop-wide tables in settings */
          rental_prices_cents: number[] | null;
          variant_images: Record<string, number>;
          /** The separates (style ids) a bundle consists of; null for regular styles */
          bundle_style_ids: string[] | null;
          name_en: string;
          description_en: string;
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
          tier?: HelmetCoverTier | null;
          tags?: string[];
          addon_price_cents?: number | null;
          replacement_value_cents?: number | null;
          rental_prices_cents?: number[] | null;
          variant_images?: Record<string, number>;
          bundle_style_ids?: string[] | null;
          name_en?: string;
          description_en?: string;
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
          tier?: HelmetCoverTier | null;
          tags?: string[];
          addon_price_cents?: number | null;
          replacement_value_cents?: number | null;
          rental_prices_cents?: number[] | null;
          variant_images?: Record<string, number>;
          bundle_style_ids?: string[] | null;
          name_en?: string;
          description_en?: string;
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
          /** Purchase cost (cents); null when not entered */
          purchase_cents: number | null;
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
          purchase_cents?: number | null;
        };
        Update: {
          size?: string;
          code?: string;
          status?: InventoryStatus;
          notes?: string;
          purchase_cents?: number | null;
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
          /** Lead / tail days recorded at order time (days of inventory occupied before the first ski day and after the last) */
          lead_days: number;
          tail_days: number;
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
          /** Shipping fee, stored once on the main order (0 = free shipping or pickup) */
          shipping_cents: number;
          total_cents: number;
          admin_note: string;
          /** Add-on child orders point to the outfit order they belong to; null for regular orders */
          parent_booking_id: string | null;
          /** Other separates in a bundle ($0 child orders), as opposed to helmet-cover add-ons */
          bundle_part: boolean;
          /** Items 2+ of a cart order (with their own rental and deposit, attached to item 1's main order) */
          cart_item: boolean;
          /** Orders submitted while signed in are linked to this account */
          user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          status?: BookingStatus;
          admin_note?: string;
          /** Written only by the server (service_role) */
          user_id?: string | null;
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
      reviews: {
        Row: {
          id: string;
          booking_id: string;
          style_id: string;
          rating: number;
          body: string;
          display_name: string;
          locale: "zh" | "en";
          status: ReviewStatus;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          style_id: string;
          rating: number;
          body: string;
          display_name: string;
          locale?: "zh" | "en";
          status?: ReviewStatus;
          published_at?: string | null;
        };
        Update: {
          status?: ReviewStatus;
          published_at?: string | null;
        };
        Relationships: [];
      };
      inventory_blocks: {
        Row: {
          id: string;
          inventory_item_id: string;
          start_date: string;
          end_date: string;
          reason: string;
          blocked_range: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          inventory_item_id: string;
          start_date: string;
          end_date: string;
          reason?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "inventory_blocks_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          user_id: string;
          full_name: string;
          phone: string;
          wechat: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          full_name?: string;
          phone?: string;
          wechat?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string;
          phone?: string;
          wechat?: string;
          updated_at?: string;
        };
        Relationships: [];
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
          p_fulfillment_method?: "pickup" | "shipping";
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
          /** Add-on style ids and their server-computed prices, matched by position */
          p_addon_style_ids?: string[];
          p_addon_cents?: number[];
        };
        Returns: {
          booking_id: string;
          booking_no: string;
          inventory_item_id: string;
        }[];
      };
      create_order: {
        Args: {
          /** Each cart item: style, size, ski days, server-computed prices, helmet-cover add-ons */
          p_lines: {
            style_id: string;
            size: string;
            start: string;
            end: string;
            daily_price_cents: number;
            rental_cents: number;
            deposit_cents: number;
            addon_style_ids: string[];
            addon_cents: number[];
          }[];
          p_customer_name: string;
          p_customer_email: string;
          p_customer_phone: string;
          p_fulfillment_method: "pickup" | "shipping";
          p_shipping_address: string | null;
          p_customer_note: string;
          /** Shipping fee computed by the server (0 for pickup or free shipping) */
          p_shipping_cents: number;
        };
        Returns: { booking_id: string; booking_no: string }[];
      };
      /** Full review rows for the admin dashboard (signed-in users querying the table directly only get display columns) */
      admin_list_reviews: {
        Args: Record<string, never>;
        Returns: Database["public"]["Tables"]["reviews"]["Row"][];
      };
      rental_price_cents: {
        Args: { p_days: number };
        Returns: number;
      };
      style_rental_price_cents: {
        Args: { p_style_id: string; p_days: number };
        Returns: number;
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
export type InventoryBlockRow = Database["public"]["Tables"]["inventory_blocks"]["Row"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type SettingsRow = Database["public"]["Tables"]["settings"]["Row"];
export type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];
