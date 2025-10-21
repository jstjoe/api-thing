# JSONata Transformation Examples

Practical examples of JSONata transformations for common API transformation scenarios.

## Table of Contents

- [Basic Field Mapping](#basic-field-mapping)
- [Nested Objects](#nested-objects)
- [Arrays](#arrays)
- [Conditional Logic](#conditional-logic)
- [Data Type Conversions](#data-type-conversions)
- [Date Transformations](#date-transformations)
- [Advanced Patterns](#advanced-patterns)

## Basic Field Mapping

### Simple Rename

Transform `user_id` to `id`:

```jsonata
{
  "id": user_id,
  "name": name
}
```

**Input:**
```json
{
  "user_id": 123,
  "name": "John"
}
```

**Output:**
```json
{
  "id": 123,
  "name": "John"
}
```

### Multiple Renames

```jsonata
{
  "id": user_id,
  "firstName": first_name,
  "lastName": last_name,
  "emailAddress": email
}
```

## Nested Objects

### Flatten Nested Structure

Transform nested address to flat structure:

```jsonata
{
  "id": id,
  "city": address.city,
  "street": address.street,
  "country": address.country
}
```

**Input:**
```json
{
  "id": 1,
  "address": {
    "street": "123 Main St",
    "city": "Boston",
    "country": "USA"
  }
}
```

**Output:**
```json
{
  "id": 1,
  "city": "Boston",
  "street": "123 Main St",
  "country": "USA"
}
```

### Nest Flat Structure

Opposite direction - create nested object:

```jsonata
{
  "id": id,
  "address": {
    "street": street,
    "city": city,
    "country": country
  }
}
```

### Deep Nesting

```jsonata
{
  "user": {
    "profile": {
      "name": name,
      "contact": {
        "email": email,
        "phone": phone
      }
    }
  }
}
```

## Arrays

### Map Array Elements

Transform all items in an array:

```jsonata
users.$map(function($user) {
  {
    "id": $user.user_id,
    "name": $user.full_name
  }
})
```

**Input:**
```json
{
  "users": [
    { "user_id": 1, "full_name": "Alice" },
    { "user_id": 2, "full_name": "Bob" }
  ]
}
```

**Output:**
```json
[
  { "id": 1, "name": "Alice" },
  { "id": 2, "name": "Bob" }
]
```

### Filter Array

Only include active users:

```jsonata
users[status = "active"].$map(function($user) {
  {
    "id": $user.id,
    "name": $user.name
  }
})
```

### Array to Object Mapping

```jsonata
{
  "users": items.$map(function($item) {
    {
      "userId": $item.id,
      "details": {
        "name": $item.name,
        "email": $item.email
      }
    }
  })
}
```

## Conditional Logic

### Simple Conditional

Set status based on value:

```jsonata
{
  "id": id,
  "status": is_active ? "active" : "inactive"
}
```

### Multiple Conditions

```jsonata
{
  "id": id,
  "tier": (
    premium = true ? "premium" :
    pro = true ? "pro" :
    "basic"
  )
}
```

### Conditional Field Inclusion

Only include field if it exists:

```jsonata
{
  "id": id,
  "name": name,
  "email": $exists(email) ? email : null,
  "phone": $exists(phone) ? phone : undefined
}
```

### Complex Conditions

```jsonata
{
  "id": id,
  "discount": (
    age > 65 ? 0.20 :
    age < 18 ? 0.15 :
    is_student ? 0.10 :
    0
  )
}
```

## Data Type Conversions

### String to Number

```jsonata
{
  "id": $number(id),
  "price": $number(price),
  "quantity": $number(qty)
}
```

### Number to String

```jsonata
{
  "userId": $string(id),
  "age": $string(age)
}
```

### Boolean Conversion

```jsonata
{
  "isActive": $boolean(status = "active"),
  "isVerified": $boolean(verified)
}
```

## Date Transformations

### ISO String to Timestamp

```jsonata
{
  "id": id,
  "createdAt": $toMillis(created_date)
}
```

### Timestamp to ISO String

```jsonata
{
  "id": id,
  "createdDate": $fromMillis(created_at)
}
```

### Format Date

```jsonata
{
  "id": id,
  "date": $fromMillis(timestamp, "[Y0001]-[M01]-[D01]"),
  "time": $fromMillis(timestamp, "[H01]:[m01]:[s01]")
}
```

### Relative Dates

```jsonata
{
  "id": id,
  "isRecent": $toMillis($now()) - $toMillis(created) < 86400000
}
```

## Advanced Patterns

### Merge Objects

Combine multiple sources:

```jsonata
$merge([
  { "id": id, "name": name },
  { "email": email },
  metadata
])
```

### Group By

Group items by category:

```jsonata
{
  "grouped": $distinct(items.category).$map(function($cat) {
    {
      "category": $cat,
      "items": items[category = $cat]
    }
  })
}
```

### Pagination Metadata

Add pagination info:

```jsonata
{
  "data": items,
  "meta": {
    "total": $count(items),
    "page": page,
    "perPage": per_page,
    "totalPages": $ceil($count(items) / per_page)
  }
}
```

### Aggregations

```jsonata
{
  "totalRevenue": $sum(orders.amount),
  "averageOrder": $average(orders.amount),
  "orderCount": $count(orders),
  "maxOrder": $max(orders.amount),
  "minOrder": $min(orders.amount)
}
```

### Recursive Transformation

Transform nested comments:

```jsonata
function($comments) {
  $comments.$map(function($c) {
    {
      "id": $c.comment_id,
      "text": $c.comment_text,
      "replies": $c.replies ? $comments($c.replies) : []
    }
  })
}(comments)
```

### Dynamic Field Names

Use variable as field name:

```jsonata
{
  $fieldName: value
}
```

### Null Safety

Handle missing fields gracefully:

```jsonata
{
  "id": id,
  "name": name ? name : "Unknown",
  "email": $exists(email) ? email : null,
  "address": address ? {
    "city": address.city ? address.city : "N/A"
  } : null
}
```

### String Manipulation

```jsonata
{
  "id": id,
  "name": $uppercase(name),
  "slug": $lowercase($replace(name, /\s+/g, "-")),
  "initials": $substring(first_name, 0, 1) & $substring(last_name, 0, 1),
  "domain": $substringAfter(email, "@")
}
```

### Array Utilities

```jsonata
{
  "tags": $distinct(tags),
  "sortedIds": $sort(ids),
  "uniqueCategories": $distinct(items.category),
  "firstItem": items[0],
  "lastItem": items[-1],
  "slice": items[[0..4]]
}
```

## Real-World Example

Complete transformation from v1 to v2 API:

```jsonata
(
  /* Handle both single objects and arrays */
  $isArray($) ?
    $map($, function($item) {
      {
        /* Basic fields */
        "id": $item.user_id,
        "name": $item.full_name,
        "email": $item.email_address,

        /* Nested profile */
        "profile": {
          "username": $item.user_name,
          "phone": $item.phone_number,
          "website": $item.website
        },

        /* Transform address */
        "address": $item.address ? {
          "street": $item.address.street & " " & $item.address.suite,
          "city": $item.address.city,
          "zipCode": $item.address.zipcode,
          "coordinates": {
            "latitude": $number($item.address.geo.lat),
            "longitude": $number($item.address.geo.lng)
          }
        } : null,

        /* Transform company */
        "company": $item.company ? {
          "name": $item.company.name,
          "tagline": $item.company.catchPhrase
        } : null,

        /* Computed fields */
        "metadata": {
          "hasAddress": $exists($item.address),
          "hasCompany": $exists($item.company),
          "domain": $substringAfter($item.email_address, "@")
        }
      }
    })
  :
    /* Single object transformation */
    {
      "id": $.user_id,
      "name": $.full_name,
      "email": $.email_address,
      "profile": {
        "username": $.user_name,
        "phone": $.phone_number,
        "website": $.website
      },
      "address": $.address ? {
        "street": $.address.street & " " & $.address.suite,
        "city": $.address.city,
        "zipCode": $.address.zipcode,
        "coordinates": {
          "latitude": $number($.address.geo.lat),
          "longitude": $number($.address.geo.lng)
        }
      } : null,
      "company": $.company ? {
        "name": $.company.name,
        "tagline": $.company.catchPhrase
      } : null,
      "metadata": {
        "hasAddress": $exists($.address),
        "hasCompany": $exists($.company),
        "domain": $substringAfter($.email_address, "@")
      }
    }
)
```

## Testing JSONata Expressions

Use the [JSONata Exerciser](https://try.jsonata.org/) to test your expressions interactively.

Or use the validation tool:

```bash
npm run validate:transformations
```

## Resources

- [JSONata Documentation](https://docs.jsonata.org/)
- [JSONata Function Library](https://docs.jsonata.org/overview#functions)
- [JSONata Exerciser](https://try.jsonata.org/)
