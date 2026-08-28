/**
 * Supabase database types for the KISOK Lean V2 schema.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REGENERATE — do not hand-edit:
 *
 *     pnpm db:types            # wraps `supabase gen types typescript --linked`
 *
 * This checked-in copy was derived from `supabase/migrations/*.sql` so that
 * typecheck and CI work without database credentials. If it ever disagrees with
 * the migrations, the MIGRATIONS ARE CORRECT — regenerate rather than patching
 * this file. See docs/data-and-supabase.md.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          role: Database["public"]["Enums"]["app_role"];
          is_active: boolean;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          role: Database["public"]["Enums"]["app_role"];
          is_active?: boolean;
          email?: string | null;
        };
        Update: {
          display_name?: string;
          role?: Database["public"]["Enums"]["app_role"];
          is_active?: boolean;
          email?: string | null;
        };
        Relationships: [];
      };
      store_settings: {
        Row: {
          id: boolean;
          store_name: string;
          logo_media_asset_id: string | null;
          global_low_stock_threshold: number;
          customer_success_reset_seconds: number;
          store_timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          store_name: string;
          logo_media_asset_id?: string | null;
          global_low_stock_threshold?: number;
          customer_success_reset_seconds?: number;
          store_timezone: string;
        };
        Update: {
          store_name?: string;
          logo_media_asset_id?: string | null;
          global_low_stock_threshold?: number;
          customer_success_reset_seconds?: number;
          store_timezone?: string;
        };
        Relationships: [];
      };
      media_assets: {
        Row: {
          id: string;
          public_id: string;
          secure_url: string;
          asset_id: string | null;
          width: number | null;
          height: number | null;
          format: string | null;
          bytes: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          public_id: string;
          secure_url: string;
          asset_id?: string | null;
          width?: number | null;
          height?: number | null;
          format?: string | null;
          bytes?: number | null;
        };
        Update: {
          public_id?: string;
          secure_url?: string;
          asset_id?: string | null;
          width?: number | null;
          height?: number | null;
          format?: string | null;
          bytes?: number | null;
        };
        Relationships: [];
      };
      brands: {
        Row: {
          id: string;
          name: string;
          image_media_asset_id: string | null;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { name: string; image_media_asset_id?: string | null; is_active?: boolean };
        Update: { name?: string; image_media_asset_id?: string | null; is_active?: boolean };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          parent_id: string | null;
          image_media_asset_id: string | null;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          parent_id?: string | null;
          image_media_asset_id?: string | null;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          parent_id?: string | null;
          image_media_asset_id?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          name: string;
          brand_id: string | null;
          cover_media_asset_id: string | null;
          short_description: string | null;
          search_keywords: string[] | null;
          display_order: number;
          is_featured: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          brand_id?: string | null;
          cover_media_asset_id?: string | null;
          short_description?: string | null;
          search_keywords?: string[] | null;
          is_featured?: boolean;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          brand_id?: string | null;
          cover_media_asset_id?: string | null;
          short_description?: string | null;
          search_keywords?: string[] | null;
          is_featured?: boolean;
          is_active?: boolean;
        };
        Relationships: [];
      };
      product_categories: {
        Row: { product_id: string; category_id: string; created_at: string };
        Insert: { product_id: string; category_id: string };
        Update: never;
        Relationships: [];
      };
      option_types: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { name: string; is_active?: boolean };
        Update: { name?: string; is_active?: boolean };
        Relationships: [];
      };
      option_values: {
        Row: {
          id: string;
          option_type_id: string;
          value: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { option_type_id: string; value: string; is_active?: boolean };
        Update: { value?: string; is_active?: boolean };
        Relationships: [];
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          sku: string;
          barcode: string | null;
          title_override: string | null;
          search_keywords: string[] | null;
          display_order: number;
          is_active: boolean;
          low_stock_threshold: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          product_id: string;
          barcode?: string | null;
          title_override?: string | null;
          search_keywords?: string[] | null;
          is_active?: boolean;
          low_stock_threshold?: number | null;
        };
        Update: {
          barcode?: string | null;
          title_override?: string | null;
          search_keywords?: string[] | null;
          is_active?: boolean;
          low_stock_threshold?: number | null;
        };
        Relationships: [];
      };
      variant_option_values: {
        Row: {
          variant_id: string;
          option_type_id: string;
          option_value_id: string;
          created_at: string;
        };
        Insert: { variant_id: string; option_type_id: string; option_value_id: string };
        Update: { option_value_id?: string };
        Relationships: [];
      };
      product_variant_media: {
        Row: {
          variant_id: string;
          media_asset_id: string;
          display_order: number;
          is_primary: boolean;
          created_at: string;
        };
        Insert: { variant_id: string; media_asset_id: string; is_primary?: boolean };
        Update: { is_primary?: boolean };
        Relationships: [];
      };
      inventory: {
        Row: {
          variant_id: string;
          current_quantity: number;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      inventory_adjustments: {
        Row: {
          id: string;
          variant_id: string;
          quantity_change: number;
          quantity_before: number;
          quantity_after: number;
          adjustment_type: Database["public"]["Enums"]["inventory_adjustment_type"];
          reason: string | null;
          created_by: string;
          order_id: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          display_number: string;
          client_request_id: string;
          request_fingerprint: string;
          status: Database["public"]["Enums"]["order_status"];
          created_by: string;
          assigned_preparation_id: string | null;
          completed_by: string | null;
          completed_at: string | null;
          cancelled_by: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        /** Orders are created only through `create_order()`. */
        Insert: never;
        /** Orders transition only through `update_order_status()`. */
        Update: never;
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          variant_id: string;
          product_name: string;
          variant_name: string | null;
          variant_sku: string;
          variant_options: Json;
          brand_name: string | null;
          image_public_id: string | null;
          image_secure_url: string | null;
          quantity: number;
        };
        /** Immutable after creation — enforced by a database trigger. */
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      /** Startup identity. Returns zero rows when the profile is missing or inactive. */
      current_active_profile: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          display_name: string;
          role: Database["public"]["Enums"]["app_role"];
          is_active: boolean;
        }[];
      };
      /** Customer-safe catalog snapshot. Requires an active `customer` profile. */
      get_customer_catalog: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      /** Atomic, idempotent customer checkout. Requires an active `customer` profile. */
      create_order: {
        Args: { client_request_id: string; items: Json };
        Returns: Json;
      };
      /** Preparation/Admin order transition. */
      update_order_status: {
        Args: {
          order_id: string;
          target_status: Database["public"]["Enums"]["order_status"];
          reason?: string;
        };
        Returns: Json;
      };
      /** Admin surface — not used by the tablet client. */
      apply_inventory_adjustment: {
        Args: {
          variant_id: string;
          type: Database["public"]["Enums"]["inventory_adjustment_type"];
          delta: number;
          reason: string;
        };
        Returns: Json;
      };
      /** Admin surface — not used by the tablet client. */
      set_inventory_quantity: {
        Args: { variant_id: string; final_quantity: number; reason: string };
        Returns: Json;
      };
      /** Admin surface — not used by the tablet client. */
      get_media_asset_usage: { Args: { target_media_asset_id: string }; Returns: Json };
      /** Admin surface — not used by the tablet client. */
      reorder_items: {
        Args: { resource_name: string; scope_id: string; ordered_ids: string[] };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "admin" | "preparation" | "customer";
      order_status: "new" | "preparing" | "ready" | "completed" | "cancelled";
      inventory_adjustment_type:
        | "initial_stock"
        | "stock_received"
        | "manual_increase"
        | "manual_decrease"
        | "damaged_or_expired"
        | "order_deduction"
        | "order_cancellation_restoration";
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
export type DbFunctions = Database["public"]["Functions"];
