/**
 * Initial production schema — identity, RBAC, vendors, catalog, inventory,
 * shopping, orders, payments, wallet, engagement, CMS, platform.
 *
 * Conventions: UUID PKs, timestamptz timestamps, BIGINT minor-unit money,
 * soft delete via deleted_at where business requires recoverability.
 */

exports.up = async function up(knex) {
  await knex.raw(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";
    CREATE EXTENSION IF NOT EXISTS "citext";

    -- ======================= IDENTITY & ACCESS =======================

    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email CITEXT,
      phone VARCHAR(20),
      password_hash TEXT,
      full_name VARCHAR(120) NOT NULL DEFAULT '',
      avatar_url TEXT,
      date_of_birth DATE,
      gender VARCHAR(20),
      is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','suspended','banned','deleted')),
      referral_code VARCHAR(16) UNIQUE,
      referred_by UUID REFERENCES users(id),
      preferred_language VARCHAR(8) NOT NULL DEFAULT 'en',
      preferred_currency CHAR(3) NOT NULL DEFAULT 'INR',
      last_login_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (email IS NOT NULL OR phone IS NOT NULL)
    );
    CREATE UNIQUE INDEX users_email_uq ON users (email) WHERE email IS NOT NULL AND deleted_at IS NULL;
    CREATE UNIQUE INDEX users_phone_uq ON users (phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;
    CREATE INDEX users_status_idx ON users (status);

    CREATE TABLE roles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(50) NOT NULL UNIQUE,
      description TEXT,
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE permissions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) NOT NULL UNIQUE,        -- resource:action e.g. products:approve
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE role_permissions (
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE user_roles (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      assigned_by UUID REFERENCES users(id),
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE refresh_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      family_id UUID NOT NULL,                  -- rotation family; reuse detection revokes family
      device_name VARCHAR(120),
      ip_address INET,
      user_agent TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      replaced_by UUID REFERENCES refresh_tokens(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
    CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

    CREATE TABLE otp_codes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      identifier VARCHAR(255) NOT NULL,          -- phone or email
      channel VARCHAR(10) NOT NULL CHECK (channel IN ('sms','email')),
      purpose VARCHAR(30) NOT NULL CHECK (purpose IN ('login','register','password_reset','verify')),
      code_hash TEXT NOT NULL,
      attempts SMALLINT NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX otp_codes_identifier_idx ON otp_codes (identifier, purpose, created_at DESC);

    CREATE TABLE oauth_accounts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider VARCHAR(20) NOT NULL CHECK (provider IN ('google','apple','facebook')),
      provider_user_id VARCHAR(255) NOT NULL,
      email CITEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (provider, provider_user_id)
    );
    CREATE INDEX oauth_accounts_user_idx ON oauth_accounts (user_id);

    CREATE TABLE user_devices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fcm_token TEXT NOT NULL,
      platform VARCHAR(10) NOT NULL CHECK (platform IN ('android','ios','web')),
      device_model VARCHAR(120),
      app_version VARCHAR(20),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, fcm_token)
    );

    CREATE TABLE addresses (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label VARCHAR(30) NOT NULL DEFAULT 'home' CHECK (label IN ('home','work','other')),
      recipient_name VARCHAR(120) NOT NULL,
      recipient_phone VARCHAR(20) NOT NULL,
      line1 VARCHAR(255) NOT NULL,
      line2 VARCHAR(255),
      landmark VARCHAR(120),
      city VARCHAR(80) NOT NULL,
      state VARCHAR(80) NOT NULL,
      postal_code VARCHAR(12) NOT NULL,
      country CHAR(2) NOT NULL DEFAULT 'IN',
      latitude NUMERIC(9,6),
      longitude NUMERIC(9,6),
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX addresses_user_idx ON addresses (user_id) WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX addresses_default_uq ON addresses (user_id) WHERE is_default AND deleted_at IS NULL;

    -- ======================= VENDORS =======================

    CREATE TABLE vendors (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      owner_user_id UUID NOT NULL UNIQUE REFERENCES users(id),
      store_name VARCHAR(120) NOT NULL,
      store_slug VARCHAR(140) NOT NULL UNIQUE,
      description TEXT,
      logo_url TEXT,
      banner_url TEXT,
      support_email CITEXT,
      support_phone VARCHAR(20),
      gstin VARCHAR(15),
      pan VARCHAR(10),
      business_type VARCHAR(30),
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','under_review','approved','rejected','suspended')),
      commission_rate_bp INT,                    -- basis points override; NULL = category default
      rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
      rating_count INT NOT NULL DEFAULT 0,
      approved_at TIMESTAMPTZ,
      approved_by UUID REFERENCES users(id),
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX vendors_status_idx ON vendors (status);

    CREATE TABLE vendor_kyc_documents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      doc_type VARCHAR(30) NOT NULL CHECK (doc_type IN ('gst_certificate','pan_card','aadhaar','bank_proof','address_proof','other')),
      file_url TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      rejection_reason TEXT,
      reviewed_by UUID REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE vendor_bank_accounts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      account_holder VARCHAR(120) NOT NULL,
      account_number_enc TEXT NOT NULL,          -- AES-256-GCM encrypted
      ifsc VARCHAR(11) NOT NULL,
      bank_name VARCHAR(120) NOT NULL,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      is_primary BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- ======================= CATALOG =======================

    CREATE TABLE categories (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      parent_id UUID REFERENCES categories(id),
      name VARCHAR(120) NOT NULL,
      slug VARCHAR(140) NOT NULL UNIQUE,
      description TEXT,
      image_url TEXT,
      icon_url TEXT,
      commission_rate_bp INT NOT NULL DEFAULT 1000,   -- default 10%
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      seo_title VARCHAR(160),
      seo_description VARCHAR(320),
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX categories_parent_idx ON categories (parent_id) WHERE deleted_at IS NULL;

    CREATE TABLE brands (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(120) NOT NULL,
      slug VARCHAR(140) NOT NULL UNIQUE,
      logo_url TEXT,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE products (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      vendor_id UUID NOT NULL REFERENCES vendors(id),
      category_id UUID NOT NULL REFERENCES categories(id),
      brand_id UUID REFERENCES brands(id),
      title VARCHAR(255) NOT NULL,
      slug VARCHAR(300) NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      highlights JSONB NOT NULL DEFAULT '[]',
      status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','pending_approval','active','rejected','inactive','archived')),
      rejection_reason TEXT,
      hsn_code VARCHAR(10),
      tax_rate_bp INT NOT NULL DEFAULT 1800,          -- default 18% GST
      rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
      rating_count INT NOT NULL DEFAULT 0,
      review_count INT NOT NULL DEFAULT 0,
      sold_count INT NOT NULL DEFAULT 0,
      is_returnable BOOLEAN NOT NULL DEFAULT TRUE,
      return_window_days SMALLINT NOT NULL DEFAULT 7,
      is_cod_available BOOLEAN NOT NULL DEFAULT TRUE,
      seo_title VARCHAR(160),
      seo_description VARCHAR(320),
      published_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX products_vendor_idx ON products (vendor_id, status) WHERE deleted_at IS NULL;
    CREATE INDEX products_category_idx ON products (category_id, status) WHERE deleted_at IS NULL;
    CREATE INDEX products_title_trgm_idx ON products USING gin (title gin_trgm_ops);

    CREATE TABLE product_variants (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      sku VARCHAR(64) NOT NULL UNIQUE,
      barcode VARCHAR(64),
      mrp_minor BIGINT NOT NULL CHECK (mrp_minor >= 0),
      sale_price_minor BIGINT NOT NULL CHECK (sale_price_minor >= 0),
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      weight_grams INT,
      length_mm INT, width_mm INT, height_mm INT,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (sale_price_minor <= mrp_minor)
    );
    CREATE INDEX product_variants_product_idx ON product_variants (product_id) WHERE deleted_at IS NULL;

    CREATE TABLE variant_options (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
      option_name VARCHAR(50) NOT NULL,          -- Color, Size, Storage...
      option_value VARCHAR(80) NOT NULL,         -- Red, XL, 256GB...
      UNIQUE (variant_id, option_name)
    );

    CREATE TABLE product_media (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
      media_type VARCHAR(10) NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video','image_360')),
      url TEXT NOT NULL,
      thumbnail_url TEXT,
      alt_text VARCHAR(160),
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX product_media_product_idx ON product_media (product_id, sort_order);

    CREATE TABLE product_specifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      group_name VARCHAR(80) NOT NULL DEFAULT 'General',
      spec_key VARCHAR(120) NOT NULL,
      spec_value TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    );
    CREATE INDEX product_specifications_product_idx ON product_specifications (product_id);

    CREATE TABLE product_faqs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    );

    CREATE TABLE tags (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(60) NOT NULL UNIQUE,
      slug VARCHAR(70) NOT NULL UNIQUE
    );
    CREATE TABLE product_tags (
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (product_id, tag_id)
    );

    -- ======================= INVENTORY =======================

    CREATE TABLE warehouses (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      vendor_id UUID REFERENCES vendors(id),      -- NULL = platform warehouse
      name VARCHAR(120) NOT NULL,
      line1 VARCHAR(255) NOT NULL,
      city VARCHAR(80) NOT NULL,
      state VARCHAR(80) NOT NULL,
      postal_code VARCHAR(12) NOT NULL,
      country CHAR(2) NOT NULL DEFAULT 'IN',
      contact_phone VARCHAR(20),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE inventory_stocks (
      variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
      warehouse_id UUID NOT NULL REFERENCES warehouses(id),
      quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      reserved INT NOT NULL DEFAULT 0 CHECK (reserved >= 0),
      low_stock_threshold INT NOT NULL DEFAULT 5,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (variant_id, warehouse_id),
      CHECK (reserved <= quantity)
    );

    CREATE TABLE inventory_movements (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      variant_id UUID NOT NULL REFERENCES product_variants(id),
      warehouse_id UUID NOT NULL REFERENCES warehouses(id),
      movement_type VARCHAR(20) NOT NULL
        CHECK (movement_type IN ('purchase','sale','reserve','release','return','adjustment')),
      quantity_delta INT NOT NULL,
      reference_type VARCHAR(30),                 -- order, return, manual...
      reference_id UUID,
      note TEXT,
      actor_id UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX inventory_movements_variant_idx ON inventory_movements (variant_id, created_at DESC);

    -- ======================= SOCIAL PROOF =======================

    CREATE TABLE reviews (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id),
      order_item_id UUID,                          -- verified purchase link (FK added after order_items)
      rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      title VARCHAR(160),
      body TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      helpful_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (product_id, user_id)
    );
    CREATE INDEX reviews_product_idx ON reviews (product_id, status, created_at DESC);

    CREATE TABLE review_media (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      media_type VARCHAR(10) NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
      url TEXT NOT NULL
    );

    CREATE TABLE review_votes (
      review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_helpful BOOLEAN NOT NULL,
      PRIMARY KEY (review_id, user_id)
    );

    CREATE TABLE product_questions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id),
      question TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE product_answers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      question_id UUID NOT NULL REFERENCES product_questions(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id),
      is_seller BOOLEAN NOT NULL DEFAULT FALSE,
      answer TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- ======================= SHOPPING =======================

    CREATE TABLE carts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      guest_token UUID UNIQUE,                     -- pre-login carts
      coupon_id UUID,                              -- FK added after coupons
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (user_id IS NOT NULL OR guest_token IS NOT NULL)
    );

    CREATE TABLE cart_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      variant_id UUID NOT NULL REFERENCES product_variants(id),
      quantity INT NOT NULL CHECK (quantity > 0),
      is_saved_for_later BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (cart_id, variant_id)
    );

    CREATE TABLE wishlists (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(80) NOT NULL DEFAULT 'My Wishlist',
      is_default BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE wishlist_items (
      wishlist_id UUID NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (wishlist_id, product_id)
    );

    CREATE TABLE recently_viewed (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, product_id)
    );

    CREATE TABLE coupons (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      code VARCHAR(40) NOT NULL UNIQUE,
      title VARCHAR(160) NOT NULL,
      description TEXT,
      discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent','fixed')),
      discount_value INT NOT NULL CHECK (discount_value > 0),  -- bp for percent, minor units for fixed
      max_discount_minor BIGINT,
      min_order_minor BIGINT NOT NULL DEFAULT 0,
      usage_limit_total INT,
      usage_limit_per_user INT NOT NULL DEFAULT 1,
      applicable_scope VARCHAR(20) NOT NULL DEFAULT 'all'
        CHECK (applicable_scope IN ('all','category','product','vendor','first_order')),
      scope_ids UUID[],
      created_by UUID REFERENCES users(id),
      vendor_id UUID REFERENCES vendors(id),       -- NULL = platform coupon
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (ends_at > starts_at)
    );
    CREATE INDEX coupons_active_idx ON coupons (code) WHERE is_active;

    ALTER TABLE carts ADD CONSTRAINT carts_coupon_fk FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL;

    CREATE TABLE flash_sales (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title VARCHAR(160) NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (ends_at > starts_at)
    );
    CREATE TABLE flash_sale_items (
      flash_sale_id UUID NOT NULL REFERENCES flash_sales(id) ON DELETE CASCADE,
      variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
      flash_price_minor BIGINT NOT NULL CHECK (flash_price_minor >= 0),
      stock_limit INT NOT NULL,
      sold_count INT NOT NULL DEFAULT 0,
      PRIMARY KEY (flash_sale_id, variant_id)
    );

    CREATE TABLE gift_cards (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      code_hash TEXT NOT NULL UNIQUE,
      initial_value_minor BIGINT NOT NULL CHECK (initial_value_minor > 0),
      balance_minor BIGINT NOT NULL CHECK (balance_minor >= 0),
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      purchased_by UUID REFERENCES users(id),
      redeemed_by UUID REFERENCES users(id),
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- ======================= ORDERS =======================

    CREATE SEQUENCE order_number_seq START 100001;

    CREATE TABLE orders (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_number VARCHAR(20) NOT NULL UNIQUE,
      user_id UUID NOT NULL REFERENCES users(id),
      status VARCHAR(30) NOT NULL DEFAULT 'pending_payment'
        CHECK (status IN ('pending_payment','confirmed','processing','packed','shipped',
                          'out_for_delivery','delivered','cancelled','return_requested',
                          'returned','refunded','payment_failed')),
      subtotal_minor BIGINT NOT NULL,
      discount_minor BIGINT NOT NULL DEFAULT 0,
      coupon_id UUID REFERENCES coupons(id),
      coupon_code VARCHAR(40),
      shipping_minor BIGINT NOT NULL DEFAULT 0,
      tax_minor BIGINT NOT NULL DEFAULT 0,
      wallet_used_minor BIGINT NOT NULL DEFAULT 0,
      total_minor BIGINT NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      payment_method VARCHAR(20) NOT NULL
        CHECK (payment_method IN ('stripe','razorpay','cod','wallet')),
      shipping_address JSONB NOT NULL,             -- snapshot
      billing_address JSONB,
      customer_note TEXT,
      cancelled_reason TEXT,
      cancelled_by UUID REFERENCES users(id),
      idempotency_key VARCHAR(80) UNIQUE,
      placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);
    CREATE INDEX orders_status_idx ON orders (status, created_at DESC);

    CREATE TABLE order_shipments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      vendor_id UUID NOT NULL REFERENCES vendors(id),
      warehouse_id UUID REFERENCES warehouses(id),
      status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','processing','packed','shipped','out_for_delivery',
                          'delivered','cancelled','rto')),
      courier VARCHAR(30),                          -- shiprocket, delhivery, bluedart
      awb_number VARCHAR(50),
      tracking_url TEXT,
      shipped_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX order_shipments_order_idx ON order_shipments (order_id);
    CREATE INDEX order_shipments_vendor_idx ON order_shipments (vendor_id, status);

    CREATE TABLE order_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      shipment_id UUID REFERENCES order_shipments(id),
      product_id UUID NOT NULL REFERENCES products(id),
      variant_id UUID NOT NULL REFERENCES product_variants(id),
      vendor_id UUID NOT NULL REFERENCES vendors(id),
      -- immutable purchase-time snapshot --
      title VARCHAR(255) NOT NULL,
      variant_label VARCHAR(255),
      sku VARCHAR(64) NOT NULL,
      image_url TEXT,
      unit_price_minor BIGINT NOT NULL,
      mrp_minor BIGINT NOT NULL,
      quantity INT NOT NULL CHECK (quantity > 0),
      tax_rate_bp INT NOT NULL,
      tax_minor BIGINT NOT NULL DEFAULT 0,
      commission_rate_bp INT NOT NULL,
      commission_minor BIGINT NOT NULL DEFAULT 0,
      line_total_minor BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX order_items_order_idx ON order_items (order_id);
    CREATE INDEX order_items_vendor_idx ON order_items (vendor_id, created_at DESC);

    ALTER TABLE reviews ADD CONSTRAINT reviews_order_item_fk
      FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL;

    CREATE TABLE order_status_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      shipment_id UUID REFERENCES order_shipments(id),
      from_status VARCHAR(30),
      to_status VARCHAR(30) NOT NULL,
      actor_id UUID REFERENCES users(id),
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX order_status_history_order_idx ON order_status_history (order_id, created_at);

    CREATE TABLE shipment_tracking_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      shipment_id UUID NOT NULL REFERENCES order_shipments(id) ON DELETE CASCADE,
      status VARCHAR(60) NOT NULL,
      location VARCHAR(160),
      description TEXT,
      occurred_at TIMESTAMPTZ NOT NULL,
      raw_payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX shipment_tracking_events_shipment_idx ON shipment_tracking_events (shipment_id, occurred_at);

    CREATE TABLE return_requests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_id UUID NOT NULL REFERENCES orders(id),
      order_item_id UUID NOT NULL REFERENCES order_items(id),
      user_id UUID NOT NULL REFERENCES users(id),
      request_type VARCHAR(10) NOT NULL CHECK (request_type IN ('return','exchange')),
      reason VARCHAR(60) NOT NULL,
      description TEXT,
      media_urls JSONB NOT NULL DEFAULT '[]',
      status VARCHAR(30) NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested','approved','rejected','pickup_scheduled','picked',
                          'received','refund_initiated','refunded','exchanged','closed')),
      quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
      refund_amount_minor BIGINT,
      resolved_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX return_requests_order_idx ON return_requests (order_id);

    -- ======================= PAYMENTS & WALLET =======================

    CREATE TABLE payments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_id UUID NOT NULL REFERENCES orders(id),
      provider VARCHAR(20) NOT NULL CHECK (provider IN ('stripe','razorpay','cod','wallet')),
      provider_payment_id VARCHAR(120),
      provider_intent_id VARCHAR(120),
      amount_minor BIGINT NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      status VARCHAR(20) NOT NULL DEFAULT 'created'
        CHECK (status IN ('created','pending','authorized','captured','failed','cancelled')),
      failure_reason TEXT,
      method_detail JSONB,                          -- card last4, upi vpa, etc.
      captured_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX payments_order_idx ON payments (order_id);
    CREATE UNIQUE INDEX payments_provider_uq ON payments (provider, provider_payment_id)
      WHERE provider_payment_id IS NOT NULL;

    CREATE TABLE refunds (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      payment_id UUID NOT NULL REFERENCES payments(id),
      return_request_id UUID REFERENCES return_requests(id),
      provider_refund_id VARCHAR(120),
      amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
      destination VARCHAR(20) NOT NULL DEFAULT 'source' CHECK (destination IN ('source','wallet')),
      status VARCHAR(20) NOT NULL DEFAULT 'initiated'
        CHECK (status IN ('initiated','processing','completed','failed')),
      initiated_by UUID REFERENCES users(id),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE payment_webhook_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      provider VARCHAR(20) NOT NULL,
      event_id VARCHAR(160) NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      payload JSONB NOT NULL,
      processed_at TIMESTAMPTZ,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (provider, event_id)
    );

    CREATE TABLE wallets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
      reward_points INT NOT NULL DEFAULT 0 CHECK (reward_points >= 0),
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE wallet_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      wallet_id UUID NOT NULL REFERENCES wallets(id),
      txn_type VARCHAR(10) NOT NULL CHECK (txn_type IN ('credit','debit')),
      amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
      balance_after_minor BIGINT NOT NULL,
      source VARCHAR(30) NOT NULL
        CHECK (source IN ('topup','order_payment','refund','referral','reward','cashback','admin_adjustment','gift_card')),
      reference_type VARCHAR(30),
      reference_id UUID,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX wallet_transactions_wallet_idx ON wallet_transactions (wallet_id, created_at DESC);

    CREATE TABLE vendor_payouts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      vendor_id UUID NOT NULL REFERENCES vendors(id),
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      gross_minor BIGINT NOT NULL,
      commission_minor BIGINT NOT NULL,
      adjustments_minor BIGINT NOT NULL DEFAULT 0,
      net_minor BIGINT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','processing','paid','failed','on_hold')),
      utr_number VARCHAR(60),
      paid_at TIMESTAMPTZ,
      approved_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX vendor_payouts_vendor_idx ON vendor_payouts (vendor_id, created_at DESC);

    CREATE TABLE payout_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      payout_id UUID NOT NULL REFERENCES vendor_payouts(id),
      order_item_id UUID NOT NULL REFERENCES order_items(id),
      amount_minor BIGINT NOT NULL,
      txn_type VARCHAR(20) NOT NULL CHECK (txn_type IN ('sale','commission','return_deduction','adjustment')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- ======================= ENGAGEMENT =======================

    CREATE TABLE notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(160) NOT NULL,
      body TEXT NOT NULL,
      notification_type VARCHAR(30) NOT NULL DEFAULT 'general',
      data JSONB NOT NULL DEFAULT '{}',
      image_url TEXT,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

    CREATE TABLE support_tickets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      ticket_number VARCHAR(20) NOT NULL UNIQUE,
      user_id UUID NOT NULL REFERENCES users(id),
      order_id UUID REFERENCES orders(id),
      subject VARCHAR(200) NOT NULL,
      category VARCHAR(40) NOT NULL DEFAULT 'general',
      priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
      status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','in_progress','waiting_on_customer','resolved','closed')),
      assigned_to UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE ticket_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      attachments JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- ======================= CMS =======================

    CREATE TABLE banners (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title VARCHAR(160) NOT NULL,
      image_url TEXT NOT NULL,
      placement VARCHAR(30) NOT NULL DEFAULT 'home_hero',
      target_type VARCHAR(20) CHECK (target_type IN ('product','category','url','flash_sale','none')),
      target_value TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE pages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      slug VARCHAR(140) NOT NULL UNIQUE,
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      is_published BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE blogs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      slug VARCHAR(200) NOT NULL UNIQUE,
      title VARCHAR(200) NOT NULL,
      excerpt VARCHAR(400),
      body TEXT NOT NULL,
      cover_image_url TEXT,
      author_id UUID REFERENCES users(id),
      is_published BOOLEAN NOT NULL DEFAULT FALSE,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE faqs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      category VARCHAR(60) NOT NULL DEFAULT 'general',
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );

    -- ======================= PLATFORM =======================

    CREATE TABLE audit_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      actor_id UUID REFERENCES users(id),
      action VARCHAR(80) NOT NULL,               -- users:suspend, products:approve...
      entity_type VARCHAR(60) NOT NULL,
      entity_id UUID,
      before_data JSONB,
      after_data JSONB,
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC);
    CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);

    CREATE TABLE settings (
      key VARCHAR(80) PRIMARY KEY,
      value JSONB NOT NULL,
      description TEXT,
      updated_by UUID REFERENCES users(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE tax_rates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(80) NOT NULL,
      rate_bp INT NOT NULL,
      hsn_code VARCHAR(10),
      country CHAR(2) NOT NULL DEFAULT 'IN',
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE currencies (
      code CHAR(3) PRIMARY KEY,
      symbol VARCHAR(5) NOT NULL,
      name VARCHAR(50) NOT NULL,
      exchange_rate_to_base NUMERIC(18,8) NOT NULL DEFAULT 1,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE referrals (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      referrer_id UUID NOT NULL REFERENCES users(id),
      referee_id UUID NOT NULL UNIQUE REFERENCES users(id),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qualified','rewarded')),
      reward_minor BIGINT,
      rewarded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- updated_at trigger applied to all tables having the column
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN
        SELECT table_name FROM information_schema.columns
        WHERE column_name = 'updated_at' AND table_schema = 'public'
      LOOP
        EXECUTE format(
          'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
          t.table_name, t.table_name
        );
      END LOOP;
    END;
    $$;
  `);
};

/**
 * IRREVERSIBLE BY DESIGN. This is the single baseline migration for the
 * whole schema, so there is no meaningful "undo" short of dropping
 * everything — this is a full reset for local/CI use, not a scoped
 * rollback. It intentionally refuses to run against `NODE_ENV=production`
 * so a stray `knex migrate:rollback` can't wipe a real database; do not
 * remove that guard to work around it — fix the underlying reason you
 * think you need to run this instead.
 */
exports.down = async function down(knex) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to run the baseline migration\'s down() against NODE_ENV=production — '
        + 'it drops and recreates the entire public schema. This migration has no partial rollback.',
    );
  }
  await knex.raw(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
  `);
};
