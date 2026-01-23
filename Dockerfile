# Stage 1: Composer dependencies
FROM composer:2 AS composer

WORKDIR /app

# Copy composer files first for better layer caching
COPY composer.json composer.lock ./

# Install dependencies without dev packages
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist

# Copy the rest of the application
COPY . .

# Generate optimized autoloader
RUN composer dump-autoload --optimize --no-dev

# Stage 2: Production image
FROM php:8.3-fpm-alpine

# Install system dependencies
RUN apk add --no-cache \
    nginx \
    supervisor \
    mariadb-client \
    curl \
    libpng \
    libjpeg-turbo \
    freetype \
    libwebp \
    libzip \
    icu-libs \
    oniguruma

# Install build dependencies, PHP extensions, then cleanup
RUN apk add --no-cache --virtual .build-deps \
    libpng-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    libwebp-dev \
    libzip-dev \
    icu-dev \
    oniguruma-dev \
    $PHPIZE_DEPS \
    && docker-php-ext-configure gd \
        --with-freetype \
        --with-jpeg \
        --with-webp \
    && docker-php-ext-install -j$(nproc) \
        pdo_mysql \
        gd \
        opcache \
        zip \
        intl \
        mbstring \
    && apk del .build-deps \
    && rm -rf /var/cache/apk/*

# Configure PHP for production
RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

# PHP configuration
COPY docker/php.ini /usr/local/etc/php/conf.d/99-custom.ini

# Nginx configuration
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Supervisord configuration
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Set working directory
WORKDIR /var/www/html

# Copy application from composer stage
COPY --from=composer /app /var/www/html

# Copy docker-specific files
COPY docker/entrypoint.sh /entrypoint.sh

# Make entrypoint executable
RUN chmod +x /entrypoint.sh

# Create necessary directories and set permissions
RUN mkdir -p /var/www/html/sites/default/files \
    && mkdir -p /run/nginx \
    && mkdir -p /var/log/supervisor \
    && mkdir -p /var/log/nginx \
    && chown -R www-data:www-data /var/www/html/sites/default/files \
    && chmod 755 /var/www/html/sites/default/files

# Install Drush globally for easier access
RUN cp /var/www/html/vendor/bin/drush /usr/local/bin/drush \
    && chmod +x /usr/local/bin/drush

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost/user/login || exit 1

# Entrypoint
ENTRYPOINT ["/entrypoint.sh"]
