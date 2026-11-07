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

/** card = Stripe at checkout; in_person_card = rental in person + card on file; in_person = rental + cash deposit in person */
export type PaymentMethod = "card" | "in_person_card" | "in_person";

/** pending = recorded, Stripe not answered yet; unknown = the request failed without a clear answer (retry with the same key) */
export type CardChargeStatus = "pending" | "unknown" | "processing" | "succeeded" | "failed";
export type RefundStatus = "due" | "refunded";
export type AcceptanceStatus = "awaiting" | "accepted" | "declined";
export type EmailKind =
  | "new_order"
  | "order_confirmed"
  | "refund_due"
  | "awaiting_acceptance"
  | "order_declined"
  | "acceptance_reminder";
export type EmailLogStatus = "sending" | "sent" | "failed" | "dismissed";

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
          /** A picked-up piece past its return day keeps being held until today + this many days, until marked returned */
          overdue_hold_days: number;
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
          overdue_hold_days?: number;
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
          /** Flaws worth disclosing, shown on the product page ('' = none) */
          condition_note: string;
          condition_note_en: string;
          condition_image_urls: string[];
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
          condition_note?: string;
          condition_note_en?: string;
          condition_image_urls?: string[];
        };
        Update: {
          size?: string;
          code?: string;
          status?: InventoryStatus;
          notes?: string;
          purchase_cents?: number | null;
          condition_note?: string;
          condition_note_en?: string;
          condition_image_urls?: string[];
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
          /** Card on file (main order only), saved through Stripe instead of a cash deposit; null until the customer saves one */
          stripe_customer_id: string | null;
          stripe_payment_method_id: string | null;
          card_brand: string | null;
          card_last4: string | null;
          card_saved_at: string | null;
          /** 'card' = Stripe at checkout, 'in_person' = at pickup; null = manual flow (admin confirms, Zelle / Venmo) */
          payment_method: PaymentMethod | null;
          /** Cash deposit taken at pickup for 'in_person' orders (0 otherwise) */
          cash_deposit_cents: number;
          /**
           * The order's current Stripe payment attempt (see claim_checkout_attempt): its key (also the Stripe idempotency key
           * and in the session's metadata), when its page expires, and its Checkout session once saved
           */
          checkout_attempt_key: string | null;
          checkout_attempt_expires_at: string | null;
          /** Card payment at checkout (Stripe): the payment; amount paid and when (also set when an in-person payment is marked received) */
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          paid_cents: number | null;
          paid_at: string | null;
          /** The condition note of the piece this order got, copied when it was placed (null = none); when the customer confirmed seeing it */
          condition_snapshot: ConditionSnapshot | null;
          condition_acknowledged_at: string | null;
          /** A payment to give back (it landed on a cancelled order, or was a second payment): due until refunded in Stripe */
          refund_status: RefundStatus | null;
          refund_cents: number | null;
          refunded_at: string | null;
          /** Shipping on short notice: rush fee included in shipping_cents (0 = none) */
          rush_fee_cents: number;
          /**
           * Shipping on short notice without rush: 'awaiting' (paid or not, the owner hasn't accepted yet; paying doesn't confirm it),
           * then 'accepted' or 'declined'; null for every other order
           */
          acceptance_status: AcceptanceStatus | null;
          acceptance_reminded_at: string | null;
          acceptance_decided_at: string | null;
          /** Picked up and not back yet: the date the admin expects it back (holds the piece until then + cleaning days) */
          expected_return_date: string | null;
          /** When the admin was emailed that this order's piece is still out with an overdue order */
          overdue_conflict_alerted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          status?: BookingStatus;
          admin_note?: string;
          /** Written only by the server (service_role) */
          user_id?: string | null;
          stripe_customer_id?: string | null;
          stripe_payment_method_id?: string | null;
          card_brand?: string | null;
          card_last4?: string | null;
          card_saved_at?: string | null;
          payment_method?: PaymentMethod | null;
          cash_deposit_cents?: number;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          paid_cents?: number | null;
          paid_at?: string | null;
          condition_snapshot?: ConditionSnapshot | null;
          condition_acknowledged_at?: string | null;
          refund_status?: RefundStatus | null;
          refund_cents?: number | null;
          refunded_at?: string | null;
          overdue_conflict_alerted_at?: string | null;
          acceptance_status?: AcceptanceStatus | null;
          acceptance_reminded_at?: string | null;
          acceptance_decided_at?: string | null;
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
      card_charges: {
        Row: {
          id: string;
          booking_id: string;
          amount_cents: number;
          reason: string;
          status: CardChargeStatus;
          stripe_payment_intent_id: string | null;
          failure_message: string | null;
          /** Stripe idempotency key of this attempt (null for charges made before keys were stored) */
          idempotency_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          booking_id: string;
          amount_cents: number;
          reason: string;
          status: CardChargeStatus;
          stripe_payment_intent_id?: string | null;
          failure_message?: string | null;
          idempotency_key?: string | null;
        };
        /** Written only by the server: the result of the attempt (from the admin action or the webhook) */
        Update: {
          status?: CardChargeStatus;
          stripe_payment_intent_id?: string | null;
          failure_message?: string | null;
          updated_at?: string;
        };
        Relationships: [];
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
      email_log: {
        Row: {
          id: string;
          booking_id: string;
          kind: EmailKind;
          params: Record<string, unknown>;
          status: EmailLogStatus;
          attempts: number;
          last_error: string | null;
          created_at: string;
          updated_at: string;
          sent_at: string | null;
        };
        Insert: {
          id?: string;
          booking_id: string;
          kind: EmailKind;
          params?: Record<string, unknown>;
          status?: EmailLogStatus;
          attempts?: number;
          last_error?: string | null;
          updated_at?: string;
          sent_at?: string | null;
        };
        Update: {
          status?: EmailLogStatus;
          attempts?: number;
          last_error?: string | null;
          updated_at?: string;
          sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_log_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
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
          /** Gloves add-ons: the chosen size; null for a helmet cover */
          p_addon_sizes?: (string | null)[];
        };
        Returns: {
          booking_id: string;
          booking_no: string;
          inventory_item_id: string;
        }[];
      };
      /** One Stripe payment attempt per order: the one in progress, or a new one (service role only) */
      claim_checkout_attempt: {
        Args: { p_booking_id: string; p_replace_key?: string | null };
        Returns: {
          attempt_key: string;
          expires_at: string;
          session_id: string | null;
          customer_id: string | null;
          created: boolean;
        }[];
      };
      /** Admin: block dates on a piece; raises booking_conflict <order no.> when an order holds it then */
      add_inventory_block: {
        Args: { p_item_id: string; p_start: string; p_end: string; p_reason: string };
        Returns: string;
      };
      /** Admin: set or clear a picked-up order's expected return date; raises return_conflict <order nos> unless p_confirm */
      set_expected_return_date: {
        Args: { p_booking_id: string; p_date: string | null; p_confirm?: boolean };
        Returns: undefined;
      };
      /** Picked-up orders held past their dates that run into another order on the same piece */
      overdue_conflicts: {
        Args: Record<string, never>;
        Returns: {
          late_booking_id: string;
          late_booking_no: string;
          item_code: string;
          hold_until: string;
          booking_id: string;
          booking_no: string;
          start_date: string;
          alerted_at: string | null;
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
            addon_sizes: (string | null)[];
            /** The customer confirmed this item's condition notes (required when it gets a piece with a note) */
            condition_ack: boolean;
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
      /** create_order plus the short-notice shipping choice (p_shipping_cents includes the rush fee); service role only */
      place_order: {
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
            addon_sizes: (string | null)[];
            /** The customer confirmed this item's condition notes (required when it gets a piece with a note) */
            condition_ack: boolean;
          }[];
          p_customer_name: string;
          p_customer_email: string;
          p_customer_phone: string;
          p_fulfillment_method: "pickup" | "shipping";
          p_shipping_address: string | null;
          p_customer_note: string;
          /** Shipping fee computed by the server (0 for pickup or free shipping) */
          p_shipping_cents: number;
          p_rush_fee_cents: number;
          p_needs_acceptance: boolean;
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
      cart_availability: {
        Args: {
          p_lines: {
            style_id: string;
            size: string;
            start: string;
            end: string;
            addon_style_ids: string[];
            addon_sizes: (string | null)[];
          }[];
        };
        Returns: { line: number; fulfillment_method: "pickup" | "shipping"; item_ok: boolean; addons_ok: boolean }[];
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

/** A piece's condition note as it was when an order was placed */
export interface ConditionSnapshot {
  code: string;
  size: string;
  note: string;
  noteEn: string;
  imageUrls: string[];
}

export type StyleRow = Database["public"]["Tables"]["styles"]["Row"];
export type InventoryItemRow = Database["public"]["Tables"]["inventory_items"]["Row"];
export type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
export type InventoryBlockRow = Database["public"]["Tables"]["inventory_blocks"]["Row"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type SettingsRow = Database["public"]["Tables"]["settings"]["Row"];
export type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];
export type CardChargeRow = Database["public"]["Tables"]["card_charges"]["Row"];
export type EmailLogRow = Database["public"]["Tables"]["email_log"]["Row"];
