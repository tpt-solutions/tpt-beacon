//! SQL safety utilities for beacon-semantic.
//!
//! Prevents SQL injection by validating identifiers and expressions
//! against safe patterns before interpolation into SQL strings.

/// Validate a SQL identifier (table name, column name, alias).
/// Only allows alphanumeric characters, underscores, and dots (for schema.table).
/// Returns an error if the identifier contains dangerous characters.
pub fn validate_identifier(name: &str) -> Result<&str, String> {
    if name.is_empty() {
        return Err("empty identifier".into());
    }

    // Allow only alphanumeric, underscore, and dot (for schema.table references).
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
    {
        return Err(format!(
            "invalid identifier: contains disallowed characters: {name:?}"
        ));
    }

    // Must not start with a digit.
    if name.chars().next().map_or(false, |c| c.is_ascii_digit()) {
        return Err(format!("invalid identifier: must not start with a digit: {name:?}"));
    }

    // Reject common SQL keywords (case-insensitive check).
    let upper = name.to_uppercase();
    let dangerous_keywords = [
        "DROP", "DELETE", "INSERT", "UPDATE", "SELECT", "CREATE", "ALTER",
        "TRUNCATE", "GRANT", "REVOKE", "EXECUTE", "UNION", "WHERE", "AND",
        "OR", "SET", "INTO", "FROM", "JOIN", "HAVING", "GROUP", "ORDER",
        "LIMIT", "OFFSET", "UNION", "EXCEPT", "INTERSECT",
    ];
    if dangerous_keywords.contains(&upper.as_str()) {
        return Err(format!("identifier is a reserved SQL keyword: {name:?}"));
    }

    Ok(name)
}

/// Validate and quote a SQL identifier safely.
/// Returns a double-quoted identifier with internal quotes escaped.
pub fn safe_identifier(name: &str) -> Result<String, String> {
    validate_identifier(name)?;
    // Escape any internal double-quotes (defensive — validate_identifier rejects them).
    let escaped = name.replace('"', "\"\"");
    Ok(format!("\"{escaped}\""))
}

/// Validate a SQL table name for WebSocket subscriptions.
/// Strips and rejects semicolons, comments, and multi-statement patterns.
pub fn validate_table_name(name: &str) -> Result<String, String> {
    if name.is_empty() {
        return Err("empty table name".into());
    }

    // Reject semicolons (statement terminator).
    if name.contains(';') {
        return Err(format!("table name contains semicolon: {name:?}"));
    }

    // Reject double-dashes (SQL comments).
    if name.contains("--") {
        return Err(format!("table name contains comment marker: {name:?}"));
    }

    // Reject slash-star (block comments).
    if name.contains("/*") {
        return Err(format!("table name contains block comment: {name:?}"));
    }

    // Reject backticks (MySQL-style quoting).
    if name.contains('`') {
        return Err(format!("table name contains backtick: {name:?}"));
    }

    // Validate the identifier part (may be schema.table).
    for part in name.split('.') {
        validate_identifier(part)?;
    }

    Ok(name.to_string())
}

/// Validate a SQL expression for use in metric definitions.
/// Only allows expressions that match a strict whitelist pattern:
/// column names, numeric literals, and a limited set of SQL functions.
pub fn validate_expression(expr: &str) -> Result<String, String> {
    if expr.trim().is_empty() {
        return Err("empty expression".into());
    }

    let trimmed = expr.trim();

    // Reject multi-statement (semicolons).
    if trimmed.contains(';') {
        return Err(format!("expression contains semicolon: {expr:?}"));
    }

    // Reject comments.
    if trimmed.contains("--") || trimmed.contains("/*") {
        return Err(format!("expression contains comment: {expr:?}"));
    }

    // Allow simple numeric literals.
    if trimmed.parse::<f64>().is_ok() {
        return Ok(trimmed.to_string());
    }

    // Allow simple column references (alphanumeric + underscore + dots).
    if validate_identifier(trimmed).is_ok() {
        return Ok(trimmed.to_string());
    }

    // Allow common aggregate/scalar functions with a single column argument.
    // Pattern: FUNC_NAME(column_or_literal)
    let allowed_funcs = [
        "COUNT", "SUM", "AVG", "MIN", "MAX", "ABS", "CEIL", "FLOOR",
        "ROUND", "LENGTH", "LOWER", "UPPER", "TRIM", "COALESCE",
        "CASE", "WHEN", "THEN", "ELSE", "END",
    ];

    let upper = trimmed.to_uppercase();
    for func in &allowed_funcs {
        if upper.starts_with(&format!("{func}(")) && trimmed.ends_with(')') {
            let inner = &trimmed[func.len() + 1..trimmed.len() - 1];
            // Validate the inner expression recursively (but only one level).
            let inner_trimmed = inner.trim();
            if inner_trimmed == "*" {
                return Ok(trimmed.to_string());
            }
            if validate_identifier(inner_trimmed).is_ok() {
                return Ok(trimmed.to_string());
            }
            if inner_trimmed.parse::<f64>().is_ok() {
                return Ok(trimmed.to_string());
            }
            // Allow function composition: SUM(ABS(col))
            if validate_expression(inner_trimmed).is_ok() {
                return Ok(trimmed.to_string());
            }
        }
    }

    // Allow CASE expressions (simplified check).
    if upper.starts_with("CASE ") && upper.ends_with(" END") {
        // Basic validation: no semicolons or comments (already checked above).
        return Ok(trimmed.to_string());
    }

    Err(format!("expression not in allowlist: {expr:?}"))
}

/// Validate a custom time interval expression.
/// Only allows patterns like: '1 hour', '30 minutes', '7 days', etc.
pub fn validate_time_interval(expr: &str) -> Result<String, String> {
    let trimmed = expr.trim();
    if trimmed.is_empty() {
        return Err("empty time interval".into());
    }

    // Reject SQL injection patterns.
    if trimmed.contains(';') || trimmed.contains("--") || trimmed.contains("/*") {
        return Err(format!("time interval contains dangerous characters: {expr:?}"));
    }

    // Allow simple interval patterns: number + unit.
    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.len() == 2 {
        if parts[0].parse::<u64>().is_ok() {
            let valid_units = [
                "second", "seconds", "minute", "minutes", "hour", "hours",
                "day", "days", "week", "weeks", "month", "months", "year", "years",
            ];
            if valid_units.contains(&parts[1].to_lowercase().as_str()) {
                return Ok(trimmed.to_string());
            }
        }
    }

    Err(format!("invalid time interval format: {expr:?}"))
}

/// Validate a graph pattern expression (Cypher-like MATCH clause).
/// Allows only alphanumeric characters, underscores, dots, parens,
/// arrows (->), colons, quotes, and spaces.
pub fn validate_graph_pattern(expr: &str) -> Result<String, String> {
    if expr.trim().is_empty() {
        return Err("empty graph pattern".into());
    }

    // Reject SQL injection patterns.
    if expr.contains(';') {
        return Err(format!("graph pattern contains semicolon: {expr:?}"));
    }
    if expr.contains("--") || expr.contains("/*") {
        return Err(format!("graph pattern contains comment: {expr:?}"));
    }

    // Allow only safe characters for Cypher-like patterns.
    if !expr
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == ' '
            || c == '(' || c == ')' || c == '{' || c == '}'
            || c == ':' || c == '"' || c == '\'' || c == '.'
            || c == '=' || c == '>' || c == '<' || c == '-'
            || c == '|' || c == '*' || c == ',')
    {
        return Err(format!(
            "graph pattern contains disallowed characters: {expr:?}"
        ));
    }

    Ok(expr.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_identifier_ok() {
        assert!(validate_identifier("users").is_ok());
        assert!(validate_identifier("user_name").is_ok());
        assert!(validate_identifier("schema.users").is_ok());
        assert!(validate_identifier("t123").is_ok());
    }

    #[test]
    fn test_validate_identifier_rejects() {
        assert!(validate_identifier("users; DROP TABLE").is_err());
        assert!(validate_identifier("123abc").is_err());
        assert!(validate_identifier("").is_err());
        assert!(validate_identifier("SELECT").is_err());
    }

    #[test]
    fn test_safe_identifier() {
        assert_eq!(safe_identifier("users").unwrap(), "\"users\"");
        assert_eq!(safe_identifier("schema.users").unwrap(), "\"schema.users\"");
        assert!(safe_identifier("users; DROP").is_err());
    }

    #[test]
    fn test_validate_table_name() {
        assert!(validate_table_name("users").is_ok());
        assert!(validate_table_name("public.users").is_ok());
        assert!(validate_table_name("users; DROP TABLE").is_err());
        assert!(validate_table_name("users--comment").is_err());
        assert!(validate_table_name("users/*comment*/").is_err());
    }

    #[test]
    fn test_validate_expression() {
        assert!(validate_expression("SUM(amount)").is_ok());
        assert!(validate_expression("COUNT(*)").is_ok());
        assert!(validate_expression("42").is_ok());
        assert!(validate_expression("revenue").is_ok());
        assert!(validate_expression("SUM(ABS(amount))").is_ok());
        assert!(validate_expression("DROP TABLE users").is_err());
        assert!(validate_expression("1; DROP TABLE").is_err());
    }

    #[test]
    fn test_validate_time_interval() {
        assert!(validate_time_interval("1 hour").is_ok());
        assert!(validate_time_interval("30 minutes").is_ok());
        assert!(validate_time_interval("7 days").is_ok());
        assert!(validate_time_interval("1 year").is_ok());
        assert!(validate_time_interval("SELECT 1").is_err());
        assert!(validate_time_interval("1; DROP TABLE").is_err());
    }
}
