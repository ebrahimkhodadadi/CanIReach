use std::net::ToSocketAddrs;
use std::time::Duration;

#[tokio::main]
async fn main() {
    println!("=== CanIReach Network Diagnostics ===");

    let targets = vec!["google.com", "github.com", "crates.io", "localhost"];

    for target in targets {
        println!("\n--- Testing Target: {} ---", target);

        // 1. DNS Resolution
        print!("  DNS resolving... ");
        match format!("{}:443", target).to_socket_addrs() {
            Ok(mut addrs) => {
                let addr_list: Vec<_> = addrs.by_ref().collect();
                println!(
                    "SUCCESS ({} resolved IPs: {:?})",
                    addr_list.len(),
                    addr_list
                );
            }
            Err(e) => {
                println!("FAIL (Error: {})", e);
                continue;
            }
        }

        // 2. TCP Connection
        print!("  TCP connecting (port 443)... ");
        let resolved = format!("{}:443", target)
            .to_socket_addrs()
            .ok()
            .and_then(|mut a| a.next());
        if let Some(addr) = resolved {
            match std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(3)) {
                Ok(_) => println!("SUCCESS"),
                Err(e) => println!("FAIL (Error: {})", e),
            }
        } else {
            println!("SKIPPED (No IP resolved)");
        }

        // 3. HTTP GET (No Proxy)
        print!("  HTTP GET (No Proxy)... ");
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build();
        match client {
            Ok(c) => match c.get(format!("https://{}", target)).send().await {
                Ok(resp) => println!("SUCCESS (Status: {})", resp.status()),
                Err(e) => println!("FAIL (Error: {})", e),
            },
            Err(e) => println!("FAIL to build client: {}", e),
        }

        // 4. HTTP GET (With Proxy http://127.0.0.1:10888)
        print!("  HTTP GET (With Proxy http://127.0.0.1:10888)... ");
        let proxy = reqwest::Proxy::all("http://127.0.0.1:10888");
        match proxy {
            Ok(p) => {
                let client_with_proxy = reqwest::Client::builder()
                    .proxy(p)
                    .timeout(Duration::from_secs(3))
                    .build();
                match client_with_proxy {
                    Ok(c) => match c.get(format!("https://{}", target)).send().await {
                        Ok(resp) => println!("SUCCESS (Status: {})", resp.status()),
                        Err(e) => println!("FAIL (Error: {})", e),
                    },
                    Err(e) => println!("FAIL to build proxy client: {}", e),
                }
            }
            Err(e) => println!("FAIL to build Proxy object: {}", e),
        }
    }
}
