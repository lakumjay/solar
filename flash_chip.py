#!/usr/bin/env python3
"""
AT89S52 High-Reliability Flash Writer / Flasher (USBasp on macOS)
Flashes .hex or .bin file to AT89S52 Microcontroller.
"""
import sys
import os
import time
import usb.core
import usb.backend.libusb1

DYLIB_PATH = "/Users/jay/Library/Python/3.9/lib/python/site-packages/libusb/_platform/_macos/x64/11.6/libusb-1.0.0.dylib"

def get_device():
    backend = None
    if os.path.exists(DYLIB_PATH):
        backend = usb.backend.libusb1.get_backend(find_library=lambda x: DYLIB_PATH)
    dev = usb.core.find(idVendor=0x16c0, idProduct=0x05dc, backend=backend)
    if dev is None:
        print("❌ Error: USBasp Programmer not found! Please check USB cable.")
        sys.exit(1)
    try:
        dev.reset()
        time.sleep(0.2)
    except Exception:
        pass
    return dev

def parse_intel_hex(hex_path):
    flash_data = bytearray([0xFF] * 8192) # 8KB default
    with open(hex_path, "r") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line.startswith(":"):
                continue
            byte_count = int(line[1:3], 16)
            address = int(line[3:7], 16)
            record_type = int(line[7:9], 16)
            
            if record_type == 0x00: # Data Record
                data_hex = line[9:9 + byte_count * 2]
                for i in range(byte_count):
                    b = int(data_hex[i*2:i*2+2], 16)
                    target_addr = address + i
                    if target_addr < len(flash_data):
                        flash_data[target_addr] = b
            elif record_type == 0x01: # End of file
                break
    return flash_data

def flash_microcontroller(file_path):
    if not os.path.exists(file_path):
        print(f"❌ Error: File not found: {file_path}")
        sys.exit(1)

    print("==================================================")
    print("       AT89S52 Microcontroller Flash Programmer   ")
    print("==================================================")
    print(f"Source File: {file_path}")
    
    if file_path.endswith(".hex"):
        flash_data = parse_intel_hex(file_path)
    else:
        with open(file_path, "rb") as f:
            flash_data = bytearray(f.read())
            if len(flash_data) < 8192:
                flash_data.extend([0xFF] * (8192 - len(flash_data)))
            elif len(flash_data) > 8192:
                flash_data = flash_data[:8192]

    print(f"Loaded {len(flash_data)} bytes to write to AT89S52 Flash.")
    
    dev = get_device()
    print("Connecting to USBasp Programmer...")
    
    # Set ISP Speed
    try:
        dev.ctrl_transfer(0x40, 10, 3, 0, 0)
    except Exception:
        pass
        
    dev.ctrl_transfer(0xC0, 1, 0, 0, 1) # Connect
    time.sleep(0.05)
    
    # Programming Enable
    wVal = 0xAC | (0x53 << 8)
    dev.ctrl_transfer(0xC0, 3, wVal, 0, 4)
    time.sleep(0.02)
    
    # Read Signature
    s0 = list(dev.ctrl_transfer(0xC0, 3, 0x28 | (0x00 << 8), 0, 4))[3]
    s1 = list(dev.ctrl_transfer(0xC0, 3, 0x28 | (0x01 << 8), 0, 4))[3]
    s2 = list(dev.ctrl_transfer(0xC0, 3, 0x28 | (0x02 << 8), 0, 4))[3]
    print(f"Target Chip Signature: 0x{s0:02X} 0x{s1:02X} 0x{s2:02X}")
    
    # Step 1: Erase Chip first
    print("\n[Step 1/3] Erasing Chip Flash Memory...")
    dev.ctrl_transfer(0xC0, 3, 0xAC | (0x80 << 8), 0, 4)
    time.sleep(0.6) # Wait 600ms for erase
    
    # Re-enable programming after erase
    dev.ctrl_transfer(0xC0, 3, 0xAC | (0x53 << 8), 0, 4)
    time.sleep(0.05)
    print("Chip Erase Completed.")
    
    # Step 2: Write Data to Flash
    print("\n[Step 2/3] Writing Flash Memory (8192 bytes)...")
    total_bytes = len(flash_data)
    
    for addr in range(total_bytes):
        byte_val = flash_data[addr]
        # Write byte command: 0x40, addr_high, addr_low, data_byte
        wVal_w = 0x40 | (((addr >> 8) & 0x1F) << 8)
        wIdx_w = (addr & 0xFF) | (byte_val << 8)
        
        # Retry logic for write
        for _ in range(3):
            try:
                dev.ctrl_transfer(0xC0, 3, wVal_w, wIdx_w, 4, timeout=1000)
                break
            except Exception:
                time.sleep(0.01)
                
        time.sleep(0.003) # 3ms write cycle delay for AT89S52 flash
        
        if (addr + 1) % 1024 == 0 or (addr + 1) == total_bytes:
            pct = int(((addr + 1) / total_bytes) * 100)
            print(f"Writing Progress: {pct}% ({addr + 1}/{total_bytes} bytes written)")

    # Step 3: Verify Flash
    print("\n[Step 3/3] Verifying Flash Memory against Source...")
    mismatch_count = 0
    for addr in range(0, total_bytes, 128):
        chunk_len = min(128, total_bytes - addr)
        try:
            read_chunk = list(dev.ctrl_transfer(0xC0, 4, addr, 0, chunk_len, timeout=2000))
        except Exception:
            read_chunk = []
            for b_i in range(chunk_len):
                c_addr = addr + b_i
                r_b = dev.ctrl_transfer(0xC0, 3, 0x20 | (((c_addr >> 8) & 0x1F) << 8), (c_addr & 0xFF), 4)
                read_chunk.append(r_b[3])
                
        for b_i, val in enumerate(read_chunk):
            expected = flash_data[addr + b_i]
            if val != expected:
                mismatch_count += 1
                
    dev.ctrl_transfer(0xC0, 2, 0, 0, 1) # Disconnect
    
    print("\n==================================================")
    if mismatch_count == 0:
        print("🎉 SUCCESS: Chip Successfully Programmed and Verified!")
        print("All 8192 bytes match the source file exactly.")
    else:
        print(f"⚠️ Notice: Programming completed with {mismatch_count} verify difference(s).")
    print("==================================================")

if __name__ == "__main__":
    default_file = "/Users/jay/Downloads/je chalu che te me nakhi /new_chip_data.hex"
    target_file = sys.argv[1] if len(sys.argv) > 1 else default_file
    flash_microcontroller(target_file)
