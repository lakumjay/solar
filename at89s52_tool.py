#!/usr/bin/env python3
"""
AT89S52 USBasp Flasher & Tester Utility for macOS
"""
import sys
import time
import os

try:
    import usb.core
    import usb.backend.libusb1
except ImportError:
    print("Error: pyusb is required. Install with: pip3 install pyusb libusb")
    sys.exit(1)

# Function codes for USBasp
USBASP_FUNC_CONNECT = 1
USBASP_FUNC_DISCONNECT = 2
USBASP_FUNC_TRANSMIT = 3
USBASP_FUNC_SETISPSCK = 10

def get_device():
    dylib_path = "/Users/jay/Library/Python/3.9/lib/python/site-packages/libusb/_platform/_macos/x64/11.6/libusb-1.0.0.dylib"
    backend = None
    if os.path.exists(dylib_path):
        backend = usb.backend.libusb1.get_backend(find_library=lambda x: dylib_path)
    
    dev = usb.core.find(idVendor=0x16c0, idProduct=0x05dc, backend=backend)
    if dev is None:
        raise RuntimeError("USBasp Programmer not found! Check USB connection.")
    return dev

class AT89S52Programmer:
    def __init__(self, dev):
        self.dev = dev

    def spi(self, b0, b1, b2, b3):
        wVal = b0 | (b1 << 8)
        wIdx = b2 | (b3 << 8)
        ret = self.dev.ctrl_transfer(0xC0, USBASP_FUNC_TRANSMIT, wVal, wIdx, 4)
        return list(ret)

    def connect(self, sck_speed=3):
        # Set ISP speed (3 = stable for AT89S52)
        try:
            self.dev.ctrl_transfer(0x40, USBASP_FUNC_SETISPSCK, sck_speed, 0, 0)
        except Exception:
            pass
        self.dev.ctrl_transfer(0xC0, USBASP_FUNC_CONNECT, 0, 0, 1)
        time.sleep(0.05)
        # Send Programming Enable
        self.spi(0xAC, 0x53, 0x00, 0x00)
        time.sleep(0.02)

    def disconnect(self):
        self.dev.ctrl_transfer(0xC0, USBASP_FUNC_DISCONNECT, 0, 0, 1)

    def read_signature(self):
        s0 = self.spi(0x28, 0x00, 0x00, 0x00)[3]
        s1 = self.spi(0x28, 0x01, 0x00, 0x00)[3]
        s2 = self.spi(0x28, 0x02, 0x00, 0x00)[3]
        return s0, s1, s2

    def erase_chip(self):
        print("Erasing Chip Memory...")
        self.spi(0xAC, 0x80, 0x00, 0x00)
        time.sleep(0.6)
        self.spi(0xAC, 0x53, 0x00, 0x00)
        time.sleep(0.05)
        print("Chip Erased successfully (All bytes set to 0xFF).")

    def write_bytes(self, start_addr, data_bytes):
        print(f"Writing {len(data_bytes)} bytes starting at address 0x{start_addr:04X}...")
        for i, byte in enumerate(data_bytes):
            addr = start_addr + i
            self.spi(0x40, (addr >> 8) & 0x1F, addr & 0xFF, byte)
            time.sleep(0.005) # 5ms write delay

    def read_bytes(self, start_addr, length):
        data = []
        for i in range(length):
            addr = start_addr + i
            r = self.spi(0x20, (addr >> 8) & 0x1F, addr & 0xFF, 0x00)
            data.append(r[3])
        return data

def main():
    print("========================================")
    print(" AT89S52 Flash Programmer / Tester")
    print("========================================")
    dev = get_device()
    prog = AT89S52Programmer(dev)
    
    prog.connect()
    sig = prog.read_signature()
    print(f"Device Signature: 0x{sig[0]:02X} 0x{sig[1]:02X} 0x{sig[2]:02X}")
    
    if sig[0] == 0x1E and sig[1] == 0x52:
        print("Target: Atmel AT89S52 Microcontroller DETECTED!")
    else:
        print("Warning: Signature does not match AT89S52.")

    text_to_write = sys.argv[1] if len(sys.argv) > 1 else "hello kem cho"
    data = [ord(c) for c in text_to_write]

    prog.erase_chip()
    prog.write_bytes(0x0000, data)
    
    print("\nVerifying Flash...")
    read_back = prog.read_bytes(0x0000, len(data))
    read_text = "".join(chr(b) for b in read_back)
    
    print(f"Written text : \"{text_to_write}\"")
    print(f"Read-back    : \"{read_text}\"")
    print(f"Hex Dump     : {[hex(b) for b in read_back]}")
    
    if read_text == text_to_write:
        print("\n [SUCCESS] Data successfully written and verified in AT89S52!")
    else:
        print("\n [FAILED] Verification mismatch.")
        
    prog.disconnect()

if __name__ == "__main__":
    main()
