// https://wiki.nesdev.com/w/index.php/PPU_palettes
const paletteLookup = [
    [84, 84, 84],
    [0, 30, 116],
    [8, 16, 144],
    [48, 0, 136],
    [68, 0, 100],
    [92, 0, 48],
    [84, 4, 0],
    [60, 24, 0],
    [32, 42, 0],
    [8, 58, 0],
    [0, 64, 0],
    [0, 60, 0],
    [0, 50, 60],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [152, 150, 152],
    [8, 76, 196],
    [48, 50, 236],
    [92, 30, 228],
    [136, 20, 176],
    [160, 20, 100],
    [152, 34, 32],
    [120, 60, 0],
    [84, 90, 0],
    [40, 114, 0],
    [8, 124, 0],
    [0, 118, 40],
    [0, 102, 120],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [236, 238, 236],
    [76, 154, 236],
    [120, 124, 236],
    [176, 98, 236],
    [228, 84, 236],
    [236, 88, 180],
    [236, 106, 100],
    [212, 136, 32],
    [160, 170, 0],
    [116, 196, 0],
    [76, 208, 32],
    [56, 204, 108],
    [56, 180, 204],
    [60, 60, 60],
    [0, 0, 0],
    [0, 0, 0],
    [236, 238, 236],
    [168, 204, 236],
    [188, 188, 236],
    [212, 178, 236],
    [236, 174, 236],
    [236, 174, 212],
    [236, 180, 176],
    [228, 196, 144],
    [204, 210, 120],
    [180, 222, 120],
    [168, 226, 144],
    [152, 226, 180],
    [160, 214, 228],
    [160, 162, 160],
    [0, 0, 0],
    [0, 0, 0],
];

class PPU {
    constructor(nes) {
        this.nes = nes;
        this.rom = null;
        this.nameTables = [new Uint8Array(1024), new Uint8Array(1024)];
        this.patternTables = [new Uint8Array(4096), new Uint8Array(4096)];
        this.paletteTable = new Uint8Array(32);

        this.screenSprite = new Uint8Array(256 * 240 * 4);
        this.nameTableSprites = [new Uint8Array(256 * 240 * 4), new Uint8Array(256 * 240 * 4)];
        this.patternTableSprites = [new Uint8Array(128 * 128 * 4), new Uint8Array(128 * 128 * 4)];

        this.scanline = 0;
        this.cycle = 0;
        this.clockCounter = 0;

        // Registers
        // Status
        this.verticalBlank = false; // 7
        this.spriteZeroHit = false; // 6
        this.spriteOverflow = false; // 5
        // Mask
        this.enhanceBlue = false; // 7
        this.enhanceGreen = false; // 6
        this.enhanceRed = false; // 5
        this.renderSprites = false; // 4
        this.renderBackground = false; // 3
        this.renderSpritesLeft = false; // 2
        this.renderBackgroundLeft = false; // 1
        this.grayscale = false; // 0
        // Control
        this.nmi = false;
        this.enableNmi = false; // 7
        this.slaveMode = false; // 6 unused
        this.spriteSize = false; // 5
        this.patternBackground = false; // 4
        this.patternSprite = false; // 3
        this.incrementMode = false; // 2
        this.nametableY = false; // 1
        this.nametableX = false; // 0
        // Loopy
        // uint16_t coarse_x : 5;
        // uint16_t coarse_y : 5;
        // uint16_t nametable_x : 1;
        // uint16_t nametable_y : 1;
        // uint16_t fine_y : 3;
        // uint16_t unused : 1;
        this.addrLatch = 0x00;
        this.ppuDataBuffer = 0x00;
        this.ppuAddr = 0x0000;
    }

    getColorFromPaletteTable(colorIdx, palette) {
        return paletteLookup[this.ppuRead(0x3F00 + (palette << 2) + colorIdx) & 0x3F];
    }

    getScreen() {
        return this.screenSprite;
    }

    setScreenPixel(x, y, colorCode) {
        const color = paletteLookup[colorCode];
        const idx = ((y * 240) + x) * 4;
        this.screenSprite[idx] = color[0];
        this.screenSprite[idx + 1] = color[1];
        this.screenSprite[idx + 2] = color[2];
        this.screenSprite[idx + 3] = 255;
    }

    getNameTable(idx) {
        return this.nameTableSprites[idx];
    }

    getPatternTable(idx, palette) {
        for (let tileY = 0; tileY < 16; tileY++) {
            for (let tileX = 0; tileX < 16; tileX++) {
                const offset = (tileY * 256) + (tileX * 16);
                for (let row = 0; row < 8; row++) {
                    let tileLsb = this.ppuRead((idx * 0x1000) + offset + row);
                    let tileMsb = this.ppuRead((idx * 0x1000) + offset + row + 8);
                    for (let col = 0; col < 8; col++) {
                        const colorIdx = ((tileLsb & 0x01) << 1) | (tileMsb & 0x01);
                        const color = this.getColorFromPaletteTable(colorIdx, palette);
                        const pixelX = tileX * 8 + (7 - col);
                        const pixelY = tileY * 8 + row;
                        this.setPatternTablePixel(pixelX, pixelY, color, idx);
                        tileLsb >>= 1;
                        tileMsb >>= 1;
                    }
                }
            }
        }

        return this.patternTableSprites[idx];
    }

    setPatternTablePixel(x, y, color, patternTableIdx) {
        const idx = ((y * 128) + x) * 4;
        this.patternTableSprites[patternTableIdx][idx] = color[0];
        this.patternTableSprites[patternTableIdx][idx + 1] = color[1];
        this.patternTableSprites[patternTableIdx][idx + 2] = color[2];
        this.patternTableSprites[patternTableIdx][idx + 3] = 255;
    }

    cpuRead(addr) {
        let data = 0x00;

        switch (addr) {
        case 0x0000: // Control
            // Not readable
            break;
        case 0x0001: // Mask
            // Not readable
            break;
        case 0x0002: // Status
            data = this.getStatus();
            this.verticalBlank = false;
            this.addrLatch = 0;
            break;
        case 0x0003: // OAM Address
            break;
        case 0x0004: // OAM Data
            break;
        case 0x0005: // Scroll
            break;
        case 0x0006: // PPU Address
            // Not readable
            break;
        case 0x0007: // PPU Data
            data = this.ppuDataBuffer;
            this.ppuDataBuffer = this.ppuRead(addr);

            if (this.ppuAddr >= 0x3F00) {
                data = this.ppuDataBuffer;
            }

            this.ppuAddr++;
            break;
        }

        return data;
    }

    cpuWrite(addr, data) {
        switch (addr) {
        case 0x0000: // Control
            this.setControl(data);
            break;
        case 0x0001: // Mask
            this.setMask(data);
            break;
        case 0x0002: // Status
            // Not writable
            break;
        case 0x0003: // OAM Address
            break;
        case 0x0004: // OAM Data
            break;
        case 0x0005: // Scroll
            break;
        case 0x0006: // PPU Address
            if (this.addrLatch === 0) {
                // Store hi
                this.ppuAddr = (this.ppuAddr & 0x00FF) | (data << 8);
                this.addrLatch = 1;
            } else {
                // Store lo
                this.ppuAddr = (this.ppuAddr & 0xFF00) | data;
                this.addrLatch = 0;
            }
            break;
        case 0x0007: // PPU Data
            this.ppuWrite(this.ppuAddr, data);
            this.ppuAddr++;
            break;
        }
    }

    ppuRead(addr, readOnly) {
        addr &= 0x3FFF;
        let data = 0x00;
        const romReadData = this.rom.ppuRead(addr);

        if (romReadData !== false) {
            //
            data = romReadData;
        } else if (addr >= 0x0000 && addr <= 0x1FFF) {
            // Pattern mem
            data = this.patternTables[(addr & 0x1000) >> 12][addr & 0x0FFF];
        } else if (addr >= 0x2000 && addr <= 0x3EFF) {
            // Name table mem
        } else if (addr >= 0x3F00 && addr <= 0x3FFF) {
            // Palette mem
            // ???
            addr &= 0x001F;
            if (addr === 0x0010) addr = 0x0000;
            if (addr === 0x0014) addr = 0x0004;
            if (addr === 0x0018) addr = 0x0008;
            if (addr === 0x001C) addr = 0x000C;
            data = this.paletteTable[addr];
        }

        return data;
    }

    ppuWrite(addr, data) {
        addr &= 0x3FFF;

        if (this.rom.ppuWrite(addr, data)) {
            //
        } else if (addr >= 0x0000 && addr <= 0x1FFF) {
            // Pattern mem
            this.patternTables[(addr & 0x1000) >> 12][addr & 0x0FFF] = data;
        } else if (addr >= 0x2000 && addr <= 0x3EFF) {
            // Name table mem
        } else if (addr >= 0x3F00 && addr <= 0x3FFF) {
            // Palette mem
            // ???
            addr &= 0x001F;
            if (addr === 0x0010) addr = 0x0000;
            if (addr === 0x0014) addr = 0x0004;
            if (addr === 0x0018) addr = 0x0008;
            if (addr === 0x001C) addr = 0x000C;
            this.paletteTable[addr] = data;
        }
    }

    clock() {
        // Fake noise
        this.setScreenPixel(this.cycle - 1, this.scanline, Math.random() > 0.5 ? 0x3F : 0x30);

        if (this.scanline === -1 && this.cycle === 1) {
            this.verticalBlank = false;
        }

        if (this.scanline === 241 && this.cycle === 1) {
            this.verticalBlank = true;
            if (this.enableNmi) {
                this.nmi = true;
            }
        }

        this.cycle++;
        if (this.cycle >= 341) {
            this.cycle = 0;
            this.scanline++;

            if (this.scanline >= 261) {
                this.scanline = -1;
                this.nes.frameCounter++;
            }
        }

        this.clockCounter++;
    }

    // Registers
    getStatus() {
        let status = 0x00;
        status |= (this.verticalBlank === true) ? 0x80 : 0x00;
        status |= (this.spriteZeroHit === true) ? 0x40 : 0x00;
        status |= (this.spriteOverflow === true) ? 0x20 : 0x00;
        status |= this.ppuDataBuffer & 0x1F;
        return status;
    }

    setStatus(status) {
        this.verticalBlank = !!((status >> 7) & 0x01);
        this.spriteZeroHit = !!((status >> 6) & 0x01);
        this.spriteOverflow = !!((status >> 5) & 0x01);
    }

    getMask() {
        let mask = 0x00;
        mask |= (this.enhanceBlue === true) ? 0x80 : 0x00;
        mask |= (this.enhanceGreen === true) ? 0x40 : 0x00;
        mask |= (this.enhanceRed === true) ? 0x20 : 0x00;
        mask |= (this.renderSprites === true) ? 0x10 : 0x00;
        mask |= (this.renderBackground === true) ? 0x08 : 0x00;
        mask |= (this.renderSpritesLeft === true) ? 0x04 : 0x00;
        mask |= (this.renderBackgroundLeft === true) ? 0x02 : 0x00;
        mask |= (this.grayscale === true) ? 0x01 : 0x00;
        return mask;
    }

    setMask(mask) {
        this.enhanceBlue = !!((mask >> 7) & 0x01);
        this.enhanceGreen = !!((mask >> 6) & 0x01);
        this.enhanceRed = !!((mask >> 5) & 0x01);
        this.renderSprites = !!((mask >> 4) & 0x01);
        this.renderBackground = !!((mask >> 3) & 0x01);
        this.renderSpritesLeft = !!((mask >> 2) & 0x01);
        this.renderBackgroundLeft = !!((mask >> 1) & 0x01);
        this.grayscale = !!((mask >> 0) & 0x01);
    }

    getControl() {
        let control = 0x00;
        control |= (this.enableNmi === true) ? 0x80 : 0x00;
        control |= (this.slaveMode === true) ? 0x40 : 0x00;
        control |= (this.spriteSize === true) ? 0x20 : 0x00;
        control |= (this.patternBackground === true) ? 0x10 : 0x00;
        control |= (this.patternSprite === true) ? 0x08 : 0x00;
        control |= (this.incrementMode === true) ? 0x04 : 0x00;
        control |= (this.nametableY === true) ? 0x02 : 0x00;
        control |= (this.nametableX === true) ? 0x01 : 0x00;
        return control;
    }

    setControl(control) {
        this.enableNmi = !!((control >> 7) & 0x01);
        this.slaveMode = !!((control >> 6) & 0x01);
        this.spriteSize = !!((control >> 5) & 0x01);
        this.patternBackground = !!((control >> 4) & 0x01);
        this.patternSprite = !!((control >> 3) & 0x01);
        this.incrementMode = !!((control >> 2) & 0x01);
        this.nametableY = !!((control >> 1) & 0x01);
        this.nametableX = !!((control >> 0) & 0x01);
    }
}

export default PPU;
