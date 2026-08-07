"""Network discovery helpers."""

import ipaddress
import os
import socket


def get_local_network():
    """Return the local IPv4 subnet instead of assuming 192.168.1.0/24."""
    configured_network = os.getenv("NETWORK")
    if configured_network:
        return ipaddress.ip_network(configured_network, strict=False)

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # No packet needs to be sent; connect() selects the active interface.
        sock.connect(("192.0.2.1", 80))
        local_ip = ipaddress.ip_address(sock.getsockname()[0])
        return ipaddress.ip_network(f"{local_ip}/24", strict=False)
    finally:
        sock.close()


def get_scan_addresses():
    """Return configured printer IPs or all hosts on the local network."""
    configured_ips = os.getenv("PRINTER_IPS")
    if configured_ips:
        return [ip.strip() for ip in configured_ips.split(",") if ip.strip()]

    return [str(ip) for ip in get_local_network().hosts()]

