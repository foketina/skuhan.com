# CLAUDE.md - Skuhan.com Drupal 10 Project

## Project Overview

**Site:** skuhan.com - Personal Portfolio Website
**Drupal Version:** 10.5.4
**PHP Version:** 8.1+
**Local Environment:** DDEV
**Base Theme:** Bootstrap 3

---

## Structure & Organization

### Directory Structure

```
skuhan/
├── core/                           # Drupal core (DO NOT MODIFY)
├── modules/
│   ├── contrib/                    # Contributed modules (composer managed)
│   └── custom/                     # Custom modules
│       └── skuhan_global/          # Site-specific functionality
├── themes/
│   ├── contrib/                    # Contributed themes
│   │   └── bootstrap/              # Bootstrap base theme
│   └── skuhan/                     # Custom sub-theme
│       ├── css/                    # Compiled CSS
│       ├── sass/                   # SASS source files
│       │   ├── base/               # Variables, mixins, global styles
│       │   ├── components/         # Header, nav, buttons, etc.
│       │   └── pages/              # Page-specific styles
│       ├── scripts/                # JavaScript files
│       ├── templates/              # Twig templates
│       │   ├── system/             # page.html.twig, html.html.twig
│       │   ├── node/               # Node templates
│       │   ├── paragraph/          # Paragraph templates
│       │   ├── field/              # Field templates
│       │   ├── menu/               # Menu templates
│       │   ├── forms/              # Form templates
│       │   └── view/               # Views templates
│       └── assets/libraries/       # Third-party JS libraries
├── profiles/                       # Installation profiles
├── config/
│   └── sync/                       # Configuration export (450 files)
├── sites/
│   └── default/
│       ├── settings.php            # Main settings
│       ├── settings.ddev.php       # DDEV overrides
│       ├── services.yml            # Service configuration
│       └── files/                  # Uploaded files
├── vendor/                         # Composer dependencies
├── composer.json                   # PHP dependencies
└── .ddev/                          # DDEV configuration (gitignored)
```

### Naming Conventions

| Entity Type | Convention | Example |
|-------------|------------|---------|
| **Module** | `snake_case` | `skuhan_global` |
| **Theme** | `snake_case` | `skuhan` |
| **Content Type** | `snake_case` | `skuhan_blogs`, `skuhan_portfolio` |
| **Paragraph Type** | `snake_case` with prefix | `skuhan_p_services`, `skuhan_p_numbers` |
| **Field** | `field_` prefix + `snake_case` | `field_skuhan_portfolio_img` |
| **View** | `snake_case` | `skuhan_portfolio_stripe` |
| **Block** | `snake_case` | `social_sharing_block` |
| **Service** | `module.service_name` | `skuhan_global.helper` |
| **Route** | `module.route_name` | `skuhan_global.settings` |
| **Permission** | lowercase with spaces | `administer skuhan settings` |
| **Config** | `module.config_name` | `skuhan_global.settings` |

---

## Drupal Best Practices

### Dependency Injection

**NEVER use `\Drupal::` static calls in classes.** Use dependency injection instead.

```php
<?php

declare(strict_types=1);

namespace Drupal\skuhan_global\Service;

use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Session\AccountProxyInterface;
use Drupal\Core\StringTranslation\StringTranslationTrait;
use Drupal\Core\StringTranslation\TranslationInterface;

/**
 * Provides helper methods for Skuhan functionality.
 */
final class SkuhanHelper {

  use StringTranslationTrait;

  /**
   * Constructs a SkuhanHelper object.
   */
  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly AccountProxyInterface $currentUser,
    TranslationInterface $stringTranslation,
  ) {
    $this->stringTranslation = $stringTranslation;
  }

  /**
   * Loads a node by ID.
   */
  public function loadNode(int $nid): ?NodeInterface {
    return $this->entityTypeManager
      ->getStorage('node')
      ->load($nid);
  }

}
```

**Register in services.yml:**

```yaml
# modules/custom/skuhan_global/skuhan_global.services.yml
services:
  skuhan_global.helper:
    class: Drupal\skuhan_global\Service\SkuhanHelper
    arguments:
      - '@entity_type.manager'
      - '@current_user'
      - '@string_translation'
```

### Entity Queries - ALWAYS Use accessCheck()

```php
<?php

// CORRECT - Always specify accessCheck()
$query = $this->entityTypeManager
  ->getStorage('node')
  ->getQuery()
  ->accessCheck(TRUE)  // MANDATORY in Drupal 10+
  ->condition('type', 'skuhan_blogs')
  ->condition('status', 1)
  ->sort('created', 'DESC')
  ->range(0, 10);

$nids = $query->execute();

// Use accessCheck(FALSE) only for admin/cron operations
// and document WHY it's safe
$query = $this->entityTypeManager
  ->getStorage('node')
  ->getQuery()
  ->accessCheck(FALSE) // Safe: cron job processing all content
  ->condition('type', 'skuhan_portfolio');
```

### Configuration Management

```bash
# Export configuration to config/sync
ddev drush config:export -y
# or
ddev drush cex -y

# Import configuration from config/sync
ddev drush config:import -y
# or
ddev drush cim -y

# Export single configuration
ddev drush config:get system.site --format=yaml

# Diff configuration
ddev drush config:diff
```

**Reading config in code:**

```php
<?php

// Immutable config (read-only, cached)
$config = \Drupal::config('skuhan_global.settings');
$value = $config->get('api_key');

// Editable config (for saving)
$config = \Drupal::configFactory()->getEditable('skuhan_global.settings');
$config->set('api_key', $newValue)->save();

// In classes, inject config.factory service
public function __construct(
  private readonly ConfigFactoryInterface $configFactory,
) {}
```

### Cache Tags and Contexts

```php
<?php

// In render arrays, always declare cache metadata
$build = [
  '#theme' => 'skuhan_portfolio_list',
  '#items' => $items,
  '#cache' => [
    // Invalidate when any node changes
    'tags' => ['node_list'],
    // Or specific nodes
    'tags' => ['node:' . $node->id()],
    // Vary by these contexts
    'contexts' => [
      'user.permissions',
      'url.query_args',
      'languages:language_interface',
    ],
    // Cache for 1 hour
    'max-age' => 3600,
  ],
];

// Invalidate cache tags programmatically
\Drupal\Core\Cache\Cache::invalidateTags(['node_list', 'node:123']);
```

### Block Plugin Example

```php
<?php

declare(strict_types=1);

namespace Drupal\skuhan_global\Plugin\Block;

use Drupal\Core\Block\BlockBase;
use Drupal\Core\Cache\Cache;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Provides a 'Recent Portfolio' block.
 *
 * @Block(
 *   id = "skuhan_recent_portfolio",
 *   admin_label = @Translation("Recent Portfolio Items"),
 *   category = @Translation("Skuhan")
 * )
 */
final class RecentPortfolioBlock extends BlockBase implements ContainerFactoryPluginInterface {

  /**
   * Constructs a RecentPortfolioBlock object.
   */
  public function __construct(
    array $configuration,
    $plugin_id,
    $plugin_definition,
    private readonly EntityTypeManagerInterface $entityTypeManager,
  ) {
    parent::__construct($configuration, $plugin_id, $plugin_definition);
  }

  /**
   * {@inheritdoc}
   */
  public static function create(
    ContainerInterface $container,
    array $configuration,
    $plugin_id,
    $plugin_definition,
  ): self {
    return new self(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $container->get('entity_type.manager'),
    );
  }

  /**
   * {@inheritdoc}
   */
  public function build(): array {
    $storage = $this->entityTypeManager->getStorage('node');

    $nids = $storage->getQuery()
      ->accessCheck(TRUE)
      ->condition('type', 'skuhan_portfolio')
      ->condition('status', 1)
      ->sort('created', 'DESC')
      ->range(0, 3)
      ->execute();

    $nodes = $storage->loadMultiple($nids);

    return [
      '#theme' => 'skuhan_recent_portfolio',
      '#nodes' => $nodes,
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function getCacheTags(): array {
    return Cache::mergeTags(parent::getCacheTags(), ['node_list:skuhan_portfolio']);
  }

  /**
   * {@inheritdoc}
   */
  public function getCacheContexts(): array {
    return Cache::mergeContexts(parent::getCacheContexts(), ['user.permissions']);
  }

}
```

### Form API with ConfigFormBase

```php
<?php

declare(strict_types=1);

namespace Drupal\skuhan_global\Form;

use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;

/**
 * Configure Skuhan Global settings.
 */
final class SkuhanSettingsForm extends ConfigFormBase {

  /**
   * {@inheritdoc}
   */
  public function getFormId(): string {
    return 'skuhan_global_settings';
  }

  /**
   * {@inheritdoc}
   */
  protected function getEditableConfigNames(): array {
    return ['skuhan_global.settings'];
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state): array {
    $config = $this->config('skuhan_global.settings');

    $form['api_key'] = [
      '#type' => 'textfield',
      '#title' => $this->t('API Key'),
      '#default_value' => $config->get('api_key'),
      '#required' => TRUE,
    ];

    $form['enable_feature'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable feature'),
      '#default_value' => $config->get('enable_feature') ?? FALSE,
    ];

    return parent::buildForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function validateForm(array &$form, FormStateInterface $form_state): void {
    parent::validateForm($form, $form_state);

    $api_key = $form_state->getValue('api_key');
    if (strlen($api_key) < 10) {
      $form_state->setErrorByName('api_key', $this->t('API key must be at least 10 characters.'));
    }
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $this->config('skuhan_global.settings')
      ->set('api_key', $form_state->getValue('api_key'))
      ->set('enable_feature', $form_state->getValue('enable_feature'))
      ->save();

    parent::submitForm($form, $form_state);
  }

}
```

**Routing for the form:**

```yaml
# skuhan_global.routing.yml
skuhan_global.settings:
  path: '/admin/config/skuhan/settings'
  defaults:
    _form: '\Drupal\skuhan_global\Form\SkuhanSettingsForm'
    _title: 'Skuhan Settings'
  requirements:
    _permission: 'administer site configuration'
```

---

## Symfony Patterns

### Event Subscriber

```php
<?php

declare(strict_types=1);

namespace Drupal\skuhan_global\EventSubscriber;

use Drupal\Core\Messenger\MessengerInterface;
use Drupal\Core\Routing\RouteMatchInterface;
use Drupal\Core\Session\AccountProxyInterface;
use Drupal\Core\StringTranslation\StringTranslationTrait;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Subscribes to kernel request events.
 */
final class RequestSubscriber implements EventSubscriberInterface {

  use StringTranslationTrait;

  /**
   * Constructs a RequestSubscriber object.
   */
  public function __construct(
    private readonly AccountProxyInterface $currentUser,
    private readonly RouteMatchInterface $routeMatch,
    private readonly MessengerInterface $messenger,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function getSubscribedEvents(): array {
    return [
      KernelEvents::REQUEST => ['onRequest', 100],
    ];
  }

  /**
   * Handles the kernel request event.
   */
  public function onRequest(RequestEvent $event): void {
    if (!$event->isMainRequest()) {
      return;
    }

    // Your logic here
    $route_name = $this->routeMatch->getRouteName();
    if ($route_name === 'entity.node.canonical') {
      // Do something on node pages
    }
  }

}
```

**Register in services.yml:**

```yaml
services:
  skuhan_global.request_subscriber:
    class: Drupal\skuhan_global\EventSubscriber\RequestSubscriber
    arguments:
      - '@current_user'
      - '@current_route_match'
      - '@messenger'
    tags:
      - { name: event_subscriber }
```

### Controller with ContainerInjectionInterface

```php
<?php

declare(strict_types=1);

namespace Drupal\skuhan_global\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\DependencyInjection\ContainerInjectionInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\node\NodeInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;

/**
 * Controller for portfolio API endpoints.
 */
final class PortfolioController extends ControllerBase implements ContainerInjectionInterface {

  /**
   * Constructs a PortfolioController object.
   */
  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): self {
    return new self(
      $container->get('entity_type.manager'),
    );
  }

  /**
   * Displays portfolio item.
   *
   * @param \Drupal\node\NodeInterface $node
   *   The node entity (auto-loaded via parameter converter).
   *
   * @return array
   *   A render array.
   */
  public function view(NodeInterface $node): array {
    return [
      '#theme' => 'skuhan_portfolio_detail',
      '#node' => $node,
      '#cache' => [
        'tags' => $node->getCacheTags(),
        'contexts' => ['user.permissions'],
      ],
    ];
  }

  /**
   * Returns portfolio items as JSON.
   */
  public function apiList(): JsonResponse {
    $storage = $this->entityTypeManager->getStorage('node');

    $nids = $storage->getQuery()
      ->accessCheck(TRUE)
      ->condition('type', 'skuhan_portfolio')
      ->condition('status', 1)
      ->execute();

    $nodes = $storage->loadMultiple($nids);

    $data = array_map(fn($node) => [
      'id' => $node->id(),
      'title' => $node->getTitle(),
      'url' => $node->toUrl()->toString(),
    ], $nodes);

    return new JsonResponse(array_values($data));
  }

}
```

**Routing with parameter conversion:**

```yaml
# skuhan_global.routing.yml
skuhan_global.portfolio.view:
  path: '/portfolio/{node}'
  defaults:
    _controller: '\Drupal\skuhan_global\Controller\PortfolioController::view'
    _title: 'Portfolio'
  requirements:
    _permission: 'access content'
    node: \d+
  options:
    parameters:
      node:
        type: entity:node

skuhan_global.portfolio.api:
  path: '/api/portfolio'
  defaults:
    _controller: '\Drupal\skuhan_global\Controller\PortfolioController::apiList'
  requirements:
    _permission: 'access content'
  options:
    no_cache: TRUE
```

---

## PHP Standards

### File Header and Strict Types

```php
<?php

declare(strict_types=1);

namespace Drupal\skuhan_global\Service;

/**
 * @file
 * Contains \Drupal\skuhan_global\Service\ExampleService.
 */
```

### Constructor Property Promotion

```php
<?php

declare(strict_types=1);

// CORRECT - Use constructor property promotion (PHP 8.0+)
final class ExampleService {

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly LoggerInterface $logger,
    private readonly ConfigFactoryInterface $configFactory,
  ) {}

}

// WRONG - Old style
final class ExampleService {

  protected EntityTypeManagerInterface $entityTypeManager;

  public function __construct(EntityTypeManagerInterface $entityTypeManager) {
    $this->entityTypeManager = $entityTypeManager;
  }

}
```

### Type Hints and Return Types

```php
<?php

declare(strict_types=1);

final class PortfolioService {

  /**
   * Loads portfolio nodes.
   *
   * @param int $limit
   *   Maximum number of nodes to load.
   * @param array<string> $categories
   *   Filter by category term names.
   *
   * @return array<\Drupal\node\NodeInterface>
   *   Array of portfolio node entities.
   */
  public function loadPortfolio(int $limit = 10, array $categories = []): array {
    // Implementation
  }

  /**
   * Checks if user can edit portfolio.
   */
  public function canEdit(NodeInterface $node, AccountInterface $account): bool {
    return $node->access('update', $account);
  }

  /**
   * Gets portfolio image URL.
   */
  public function getImageUrl(NodeInterface $node): ?string {
    $field = $node->get('field_skuhan_portfolio_img');
    if ($field->isEmpty()) {
      return NULL;
    }
    return $field->entity?->getFileUri();
  }

}
```

### DocBlocks Following Drupal Format

```php
<?php

/**
 * Provides helper methods for portfolio functionality.
 *
 * This service handles portfolio-related operations including
 * loading, filtering, and processing portfolio nodes.
 */
final class PortfolioHelper {

  /**
   * Loads recent portfolio items.
   *
   * @param int $count
   *   The number of items to load. Defaults to 6.
   * @param string|null $category
   *   Optional category term name to filter by.
   *
   * @return \Drupal\node\NodeInterface[]
   *   An array of portfolio node entities, keyed by node ID.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function loadRecent(int $count = 6, ?string $category = NULL): array {
    // Implementation
  }

}
```

### Final Classes by Default

```php
<?php

declare(strict_types=1);

// CORRECT - Use final by default
final class SkuhanHelper {
  // ...
}

// Only omit final when extension is explicitly designed
abstract class SkuhanPluginBase {
  // ...
}

// Or for test doubles
class SkuhanHelperTestDouble extends SkuhanHelper {
  // Only in tests
}
```

---

## Twig Templating

### Template Naming Conventions

```
# Node templates
node--[type].html.twig              # node--skuhan-blogs.html.twig
node--[type]--[view-mode].html.twig # node--skuhan-blogs--teaser.html.twig

# Paragraph templates
paragraph--[type].html.twig         # paragraph--skuhan-p-services.html.twig

# Field templates
field--[name].html.twig             # field--field-skuhan-portfolio-img.html.twig
field--[name]--[bundle].html.twig   # field--body--skuhan-blogs.html.twig

# Block templates
block--[id].html.twig               # block--skuhan-recent-portfolio.html.twig

# Form templates
form-element--[type].html.twig      # form-element--textfield.html.twig

# Views templates
views-view--[name].html.twig        # views-view--skuhan-portfolio-stripe.html.twig
views-view-unformatted--[name].html.twig
```

### Security Best Practices

```twig
{# CORRECT - Auto-escaped by default #}
{{ node.title.value }}
{{ content.field_body }}

{# CORRECT - Translation with placeholders #}
{{ 'Welcome, @name!'|t({'@name': user.displayname}) }}
{{ 'Posted on @date'|t({'@date': node.created.value|date('F j, Y')}) }}

{# CORRECT - URL generation #}
<a href="{{ url('entity.node.canonical', {'node': node.id}) }}">
  {{ node.label }}
</a>

{# CORRECT - Using path for internal links #}
<a href="{{ path('skuhan_global.portfolio') }}">View Portfolio</a>

{# DANGER - Only use raw when absolutely necessary and content is trusted #}
{{ content.field_safe_html|raw }}

{# CORRECT - Escape for JavaScript context #}
<script>
  var title = {{ node.title.value|json_encode|raw }};
</script>
```

### Proper Attribute Handling

```twig
{# CORRECT - Use attributes object #}
<article{{ attributes.addClass('portfolio-item', 'card') }}>
  <div{{ content_attributes.addClass('card-body') }}>
    {{ content }}
  </div>
</article>

{# CORRECT - Add conditional classes #}
{% set classes = [
  'node',
  'node--type-' ~ node.bundle|clean_class,
  node.isPromoted() ? 'node--promoted',
  node.isSticky() ? 'node--sticky',
  not node.isPublished() ? 'node--unpublished',
  view_mode ? 'node--view-mode-' ~ view_mode|clean_class,
] %}
<article{{ attributes.addClass(classes) }}>

{# CORRECT - Create new attributes #}
{% set link_attributes = create_attribute() %}
{% set link_attributes = link_attributes
  .addClass('btn', 'btn-primary')
  .setAttribute('data-toggle', 'modal')
%}
<a{{ link_attributes }}>Click me</a>
```

### Common Twig Patterns

```twig
{# Check if field has value #}
{% if content.field_image|render|trim %}
  {{ content.field_image }}
{% endif %}

{# Loop with index #}
{% for item in items %}
  <div class="item item-{{ loop.index }}{% if loop.first %} first{% endif %}{% if loop.last %} last{% endif %}">
    {{ item.content }}
  </div>
{% endfor %}

{# Include partial templates #}
{% include '@skuhan/partials/card.html.twig' with {
  title: node.title.value,
  image: content.field_image,
} only %}

{# Extend base template #}
{% extends '@skuhan/layout/base.html.twig' %}
{% block content %}
  {# Page-specific content #}
{% endblock %}

{# Embed with blocks #}
{% embed '@skuhan/components/modal.html.twig' %}
  {% block modal_title %}Contact Us{% endblock %}
  {% block modal_body %}
    {{ drupal_entity('webform', 'get_in_touch') }}
  {% endblock %}
{% endembed %}
```

---

## Common Commands

### DDEV Commands

```bash
# Start/stop environment
ddev start
ddev stop
ddev restart

# Database operations
ddev drush sql-dump > backup.sql
ddev import-db --file=backup.sql
ddev mysql                          # MySQL CLI

# SSH into container
ddev ssh

# Run Drush/Composer
ddev drush [command]
ddev composer [command]

# View logs
ddev logs
ddev logs -f                        # Follow logs

# Launch browser
ddev launch
ddev launch /admin                  # Open specific path

# Get project info
ddev describe
```

### Drush Commands

```bash
# Cache operations
ddev drush cr                       # Cache rebuild
ddev drush cc render                # Clear render cache
ddev drush cc views                 # Clear views cache

# Configuration
ddev drush cex -y                   # Export config
ddev drush cim -y                   # Import config
ddev drush cst                      # Config status

# Database updates
ddev drush updb -y                  # Run database updates
ddev drush entup                    # Entity updates

# User management
ddev drush uli                      # One-time login link
ddev drush uli --uid=1              # Admin login link
ddev drush user:password admin newpass

# Content operations
ddev drush entity:delete node --bundle=skuhan_blogs
ddev drush views:execute skuhan_portfolio_stripe

# Module operations
ddev drush en module_name -y        # Enable module
ddev drush pmu module_name -y       # Uninstall module
ddev drush pm:list --status=enabled # List enabled modules

# Development
ddev drush ws                       # Watchdog show (recent logs)
ddev drush ws --severity=error      # Show only errors
ddev drush state:set system.maintenance_mode 1
ddev drush state:set system.maintenance_mode 0
```

### Composer Commands

```bash
# Add modules/themes
ddev composer require drupal/module_name
ddev composer require drupal/module_name:^2.0

# Update
ddev composer update drupal/core* --with-dependencies
ddev composer update drupal/module_name

# Remove
ddev composer remove drupal/module_name

# Maintenance
ddev composer install
ddev composer update --lock         # Update lock file only
ddev composer outdated              # Check for updates
ddev composer why drupal/token      # Why is package installed
```

### Theme Development

```bash
# Compile SASS (from themes/skuhan directory)
compass compile
compass watch                       # Watch for changes

# Clear theme cache after template changes
ddev drush cr
```

---

## Security Best Practices

### Input Validation

```php
<?php

// Sanitize user input
use Drupal\Component\Utility\Html;
use Drupal\Component\Utility\Xss;

$clean = Html::escape($userInput);           // Escape HTML
$clean = Xss::filter($userInput);            // Filter dangerous tags
$clean = Xss::filterAdmin($userInput);       // Admin-level filtering

// Validate in forms
public function validateForm(array &$form, FormStateInterface $form_state): void {
  $email = $form_state->getValue('email');
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $form_state->setErrorByName('email', $this->t('Invalid email address.'));
  }
}
```

### SQL Injection Prevention

```php
<?php

// CORRECT - Use entity query
$nids = $this->entityTypeManager
  ->getStorage('node')
  ->getQuery()
  ->accessCheck(TRUE)
  ->condition('title', $userInput)  // Automatically escaped
  ->execute();

// CORRECT - Use database API with placeholders
$result = $this->database->query(
  'SELECT nid FROM {node_field_data} WHERE title = :title',
  [':title' => $userInput]
);

// WRONG - Never concatenate user input
$result = $this->database->query(
  "SELECT * FROM {node} WHERE title = '$userInput'"  // SQL INJECTION!
);
```

### Access Control

```php
<?php

// Always check access
if ($node->access('view')) {
  // Render node
}

// In controllers, use requirements in routing.yml
// requirements:
//   _permission: 'access content'
//   _role: 'administrator'
//   _custom_access: '\Drupal\mymodule\Access\CustomAccessCheck::access'

// Custom access check
final class CustomAccessCheck implements AccessInterface {

  public function access(AccountInterface $account, NodeInterface $node = NULL): AccessResultInterface {
    if ($node === NULL) {
      return AccessResult::forbidden();
    }

    return AccessResult::allowedIf(
      $account->hasPermission('view portfolio') &&
      $node->bundle() === 'skuhan_portfolio'
    )->addCacheableDependency($node);
  }

}
```

---

## Performance Best Practices

### Lazy Loading Services

```yaml
# services.yml
services:
  skuhan_global.heavy_service:
    class: Drupal\skuhan_global\Service\HeavyService
    lazy: true  # Only instantiated when actually used
```

### Efficient Queries

```php
<?php

// Load only what you need
$nids = $storage->getQuery()
  ->accessCheck(TRUE)
  ->condition('type', 'skuhan_portfolio')
  ->range(0, 10)  // Limit results
  ->execute();

// Use loadMultiple, not load() in loops
$nodes = $storage->loadMultiple($nids);  // Single query

// WRONG
foreach ($nids as $nid) {
  $node = $storage->load($nid);  // N+1 queries!
}
```

### Static Caching

```php
<?php

final class ExpensiveCalculator {

  private static array $cache = [];

  public function calculate(string $key): int {
    if (!isset(self::$cache[$key])) {
      self::$cache[$key] = $this->doExpensiveCalculation($key);
    }
    return self::$cache[$key];
  }

}
```

---

## Testing Setup

### Directory Structure

```
modules/custom/skuhan_global/
├── tests/
│   ├── src/
│   │   ├── Unit/                   # Unit tests
│   │   │   └── SkuhanHelperTest.php
│   │   ├── Kernel/                 # Kernel tests
│   │   │   └── SkuhanServiceTest.php
│   │   └── Functional/             # Functional tests
│   │       └── PortfolioPageTest.php
│   └── modules/                    # Test modules
│       └── skuhan_global_test/
```

### Unit Test Example

```php
<?php

declare(strict_types=1);

namespace Drupal\Tests\skuhan_global\Unit;

use Drupal\skuhan_global\Service\SkuhanHelper;
use Drupal\Tests\UnitTestCase;

/**
 * @coversDefaultClass \Drupal\skuhan_global\Service\SkuhanHelper
 * @group skuhan_global
 */
final class SkuhanHelperTest extends UnitTestCase {

  /**
   * @covers ::calculateBootstrapClasses
   * @dataProvider bootstrapClassesProvider
   */
  public function testCalculateBootstrapClasses(int $count, array $expected): void {
    $helper = new SkuhanHelper();
    $result = $helper->calculateBootstrapClasses($count);

    $this->assertEquals($expected, $result);
  }

  /**
   * Data provider for testCalculateBootstrapClasses.
   */
  public static function bootstrapClassesProvider(): array {
    return [
      'single item' => [1, ['col-sm-12', 'col-md-12']],
      'two items' => [2, ['col-sm-12', 'col-md-6']],
      'three items' => [3, ['col-sm-12', 'col-md-4']],
      'four items' => [4, ['col-sm-12', 'col-md-3']],
    ];
  }

}
```

### Running Tests

```bash
# Run all tests
ddev exec vendor/bin/phpunit -c core modules/custom/skuhan_global

# Run specific test
ddev exec vendor/bin/phpunit -c core modules/custom/skuhan_global/tests/src/Unit/SkuhanHelperTest.php

# Run with coverage
ddev exec vendor/bin/phpunit -c core --coverage-html coverage modules/custom/skuhan_global
```

---

## Recommended Contrib Modules

### Already Installed

- **admin_toolbar** - Enhanced admin navigation
- **paragraphs** - Flexible content composition
- **webform** - Form building
- **metatag** - SEO metadata
- **pathauto** - URL alias patterns
- **devel** - Development utilities

### Recommended Additions

```bash
# Performance
ddev composer require drupal/redis         # Redis caching
ddev composer require drupal/big_pipe      # Progressive page rendering

# Security
ddev composer require drupal/security_review
ddev composer require drupal/password_policy

# Development
ddev composer require drupal/stage_file_proxy  # Proxy prod files locally
ddev composer require drupal/config_split      # Environment-specific config

# Content
ddev composer require drupal/scheduler        # Scheduled publishing
ddev composer require drupal/diff             # Revision comparison

# Media
ddev composer require drupal/focal_point      # Image focal point cropping
```

---

## Git Workflow

### Branch Naming

```
feature/TICKET-123-add-portfolio-filter
bugfix/TICKET-456-fix-contact-form
hotfix/security-patch
release/1.2.0
```

### Commit Messages

```
feat(portfolio): add category filter to portfolio view

- Add taxonomy term reference field
- Create exposed filter in view
- Update templates for filter display

Refs: TICKET-123
```

### .gitignore Essentials

```gitignore
# Drupal core and contrib (managed by Composer)
/core/
/modules/contrib/
/themes/contrib/
/vendor/

# Files directory
/sites/*/files/

# Local settings
/sites/*/settings.local.php
/sites/*/services.local.yml

# DDEV
/.ddev/

# IDE
/.idea/
/.vscode/

# OS
.DS_Store
Thumbs.db

# Build artifacts
/node_modules/

# Backups
*.sql
*.sql.gz
/backup/
```

---

## Environment-Specific Settings

### settings.local.php (Development)

```php
<?php

// Local development settings - DO NOT COMMIT

$settings['container_yamls'][] = DRUPAL_ROOT . '/sites/development.services.yml';

// Disable caching
$settings['cache']['bins']['render'] = 'cache.backend.null';
$settings['cache']['bins']['page'] = 'cache.backend.null';
$settings['cache']['bins']['dynamic_page_cache'] = 'cache.backend.null';

// Enable verbose error reporting
$config['system.logging']['error_level'] = 'verbose';

// Disable CSS/JS aggregation
$config['system.performance']['css']['preprocess'] = FALSE;
$config['system.performance']['js']['preprocess'] = FALSE;

// Stage file proxy (if installed)
$config['stage_file_proxy.settings']['origin'] = 'https://skuhan.com';
```

### development.services.yml

```yaml
parameters:
  twig.config:
    debug: true
    auto_reload: true
    cache: false

services:
  cache.backend.null:
    class: Drupal\Core\Cache\NullBackendFactory
```

---

## Project-Specific Notes

### Content Types

| Machine Name | Description |
|--------------|-------------|
| `skuhan_one_page` | Single-page portfolio presentation |
| `skuhan_blogs` | Blog posts |
| `skuhan_portfolio` | Portfolio items |

### Paragraph Types

| Machine Name | Description |
|--------------|-------------|
| `skuhan_p_about_skills` | Skills display with percentage bars |
| `skuhan_p_services` | Services grid item |
| `skuhan_p_services_container` | Services section wrapper |
| `skuhan_p_numbers` | Statistics counter item |
| `skuhan_p_numbers_container` | Statistics section wrapper |
| `skuhan_p_experience` | Timeline experience item |
| `skuhan_p_experience_container` | Experience section wrapper |
| `skuhan_p_bckg_img` | Background image stripe |

### Theme Libraries

Located in `themes/skuhan/assets/libraries/`:

- **particles.js** - Animated particle background
- **typed.js** - Typing animation effect
- **waypoints** - Scroll-triggered animations
- **jquery.counterup.js** - Animated counters
- **font-awesome** - Icon fonts

### Date Formats

| Machine Name | Format |
|--------------|--------|
| `skuhan_year` | Year only |
| `skuhan_day` | Day number |
| `skuhan_month` | Month name |
