# Resource Group - location must match actual (southindia)
resource "azurerm_resource_group" "attendance" {
  name     = "Attendance"
  location = "southindia"
}

# Storage Account
resource "azurerm_storage_account" "attendance" {
  name                              = "prasaattendscollege67"
  resource_group_name               = azurerm_resource_group.attendance.name
  location                          = "centralindia" 
  account_tier                      = "Standard"
  account_replication_type          = "LRS"
  min_tls_version                   = "TLS1_2"
  https_traffic_only_enabled        = true
  allow_nested_items_to_be_public   = false
  cross_tenant_replication_enabled  = false
}

# SQL Server
resource "azurerm_mssql_server" "attendance" {
  name                         = "prasannasql67"
  resource_group_name          = azurerm_resource_group.attendance.name
  location                     = "centralindia"
  version                      = "12.0"
  administrator_login          = "admin123"
  administrator_login_password = var.sql_admin_password
}

# Face API - sku must match actual (F0), with custom subdomain and network_acls
resource "azurerm_cognitive_account" "face" {
  name                  = "face-recog-api-69"
  resource_group_name   = azurerm_resource_group.attendance.name
  location              = "centralindia"
  kind                  = "Face"
  sku_name              = "F0"
  custom_subdomain_name = "face-recog-api-69"

  network_acls {
    default_action = "Allow"
    ip_rules       = []
  }
}
