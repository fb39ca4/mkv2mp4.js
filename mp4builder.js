var MP4 = {};
MP4.fourCC = function(str) {
    return new Uint8Array(str.split('').map(function (c){return c.charCodeAt(0);}));
}

MP4.Uint64 = function(number)  {
    var d = new DataView(new ArrayBuffer(8));
    d.setUint32(0, number / 0x100000000);
    d.setUint32(0, number % 0x100000000);
    return d.buffer;
}

MP4.Uint32 = function(number)  {
    var d = new DataView(new ArrayBuffer(4));
    d.setUint32(0, number);
    return d.buffer;
}

MP4.Uint16 = function(number)  {
    var d = new DataView(new ArrayBuffer(2));
    d.setUint16(0, number);
    return d.buffer;
}

MP4.padding = function(size)  {
    return new ArrayBuffer(size);
}

MP4Atom = function(name, contents) {
    this.name = name;
    this.contents = contents || [];
}

MP4Atom.prototype.toBlob = function() {
    var blobs = [];
    if (this.version) blobs.push(MP4.Uint32(this.version));
    for (var i = 0; i < this.contents.length; i++) {
        var child = this.contents[i];
        if (child.constructor === MP4Atom) {
            blobs.push(child.toBlob());
        }
        else {
            blobs.push(child);
        }
    }
    var data = new Blob(blobs);
    var name = MP4.fourCC(this.name);
    if (data.size + 8 > 0xFFFFFFFF) {
        throw "Atom is too big";
        return;
        var length = MP4.Uint64(data.size + 16);
        return new Blob([MP4.Uint32(1), name, length, data], {type:"video/mp4"});
    }
    else {
        var length = MP4.Uint32(data.size + 8);
        return new Blob([length, name, data], {type:"video/mp4"});
    }
}

MP4.box = function(name, contents) {
    return new MP4Atom(name, contents);
}

MP4.ftypBox = function() {
    //32 bytes
    return new MP4Atom("ftyp", [
        MP4.fourCC("isom"),
        MP4.Uint32(1),
        MP4.fourCC("isom"),
        MP4.fourCC("iso2"),
        MP4.fourCC("avc1"),
        MP4.fourCC("mp41"),
    ]);
};

MP4.mvhdBox = function(timescale, duration) {
    timescale = timescale || 1000;
    return new MP4Atom("mvhd", [
        MP4.Uint32(0),//version
        MP4.Uint32(0),//creation time
        MP4.Uint32(0),//modification time
        MP4.Uint32(timescale),//timescale
        MP4.Uint32(duration),//duration
        MP4.Uint32(0x00010000),//rate
        MP4.Uint16(0x01000000),//volume
        MP4.padding(10),//reserved
        MP4.Uint32(0x00010000),//display matrix
        MP4.Uint32(0),
        MP4.Uint32(0),
        MP4.Uint32(0),
        MP4.Uint32(0x00010000),
        MP4.Uint32(0),
        MP4.Uint32(0),
        MP4.Uint32(0),
        MP4.Uint32(0x40000000),
        MP4.padding(4 * 6), //reserved
        MP4.Uint32(2),//next track id
    ]);
}

MP4.tkhdBox = function(trackId, duration, width, height) {
    return new MP4Atom("tkhd", [
        MP4.Uint32(0x3),//flags
        MP4.Uint32(0),//creation time
        MP4.Uint32(0),//modification time
        MP4.Uint32(trackId),//track id
        MP4.Uint32(0),
        MP4.Uint32(duration),//duration
        MP4.padding(12),
        MP4.Uint16(0x0100),//volume
        MP4.padding(2),
        MP4.Uint32(0x00010000),//display matrix
        MP4.Uint32(0),
        MP4.Uint32(0),
        MP4.Uint32(0),
        MP4.Uint32(0x00010000),
        MP4.Uint32(0),
        MP4.Uint32(0),
        MP4.Uint32(0),
        MP4.Uint32(0x40000000),
        MP4.Uint32(width * 65536),
        MP4.Uint32(height * 65536),
    ]);
}

MP4.edtsBox = function() {
    return (new Uint8Array([
    0x00, 0x00, 0x00, 0x24, 0x65, 0x64, 0x74, 0x73, 0x00, 0x00, 0x00, 0x1C,
    0x65, 0x6C, 0x73, 0x74, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0xEA, 0x36, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00])).buffer;
}

MP4.edtsBox = function(duration) {
    duration = duration || 0xFFFFFFFF;
    return new MP4Atom("edts", [
        new MP4Atom("elst", [
            MP4.Uint32(0),//flags
            MP4.Uint32(1),//entrycount
            MP4.Uint32(duration),
            MP4.Uint32(0),
            MP4.Uint16(1),
            MP4.Uint16(0),
        ]),
    ]);
}

MP4.dinfBox = function() {
    return (new Uint8Array([
    0x00, 0x00, 0x00, 0x24, 0x64, 0x69, 0x6E, 0x66, 0x00, 0x00, 0x00, 0x1C,
    0x64, 0x72, 0x65, 0x66, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x0C, 0x75, 0x72, 0x6C, 0x20, 0x00, 0x00, 0x00, 0x01])).buffer;
}

MP4.mdhdBox = function(timescale, duration, language) {
    language = language || 0x55C40000;
    return new MP4Atom("mdhd", [
        MP4.Uint32(0),//flags
        MP4.Uint32(0),//creation time
        MP4.Uint32(0),//modification time
        MP4.Uint32(timescale),
        MP4.Uint32(duration),
        MP4.Uint32(language),
    ]);
}

MP4.hdlrBox = function(type) {
    type = type || "null";
    type = type + "    ";
    type = type.substring(0, 4);
    return new MP4Atom("hdlr", [
        MP4.padding(8),
        MP4.fourCC(type),
        MP4.padding(12),
    ]);
}

MP4.vmhdBox = function() {
    return new MP4Atom("vmhd", [
        MP4.Uint32(1),
        MP4.padding(8),
    ]);
}

MP4.stsdBoxAVC = function(width, height, codecPrivate) {
    return new MP4.box("stsd", [
        MP4.Uint32(0),//version
        MP4.Uint32(1),//entry count
        MP4.box("avc1", [
            MP4.Uint32(0),
            MP4.Uint32(1),
            MP4.padding(16),
            MP4.Uint16(width),
            MP4.Uint16(height),
            MP4.Uint32(0x00480000),//horizontal DPI
            MP4.Uint32(0x00480000),//vertical DPI
            MP4.Uint32(0),
            MP4.Uint16(1),
            MP4.padding(32),
            MP4.Uint32(0x18FFFF),
            MP4.box("avcC", [
                codecPrivate,
            ]),
        ]),
    ]);
}

MP4.sttsBox = function(sampleDecodeTimeList) {
    var sttsEntryCount = sampleDecodeTimeList.length;
    var sttsEntries = new DataView(new ArrayBuffer(sttsEntryCount * 2 * 4));
    var lastTimecode = 0;
    for (var i = 0; i < sttsEntryCount; i++) {
        var offset = i * 2 * 4;
        sttsEntries.setUint32(offset, 1);
        sttsEntries.setUint32(offset + 4, sampleDecodeTimeList[i] - lastTimecode);
        lastTimecode = sampleDecodeTimeList[i];
    }
    return new MP4Atom("stts", [
        MP4.Uint32(0),
        MP4.Uint32(sttsEntryCount), 
        sttsEntries.buffer,
    ]);
}

MP4.stssBox = function(syncSampleList) {
    var stssEntryCount = syncSampleList.length;
    var stssEntries = new DataView(new ArrayBuffer(stssEntryCount * 4));
    var lastTimecode = 0;
    for (var i = 0; i < stssEntryCount; i++) {
        var offset = i * 4;
        stssEntries.setUint32(offset, syncSampleList[i]);
    }
    return new MP4Atom("stss", [
        MP4.Uint32(0),
        MP4.Uint32(stssEntryCount), 
        stssEntries.buffer,
    ]);
}

MP4.stscBox = function(samplesPerChunkList) {
    var stscEntryCount = samplesPerChunkList.length;
    var stscEntries = new DataView(new ArrayBuffer(stscEntryCount * 3 * 4));
    for (var i = 0; i < stscEntryCount; i++) {
        var offset = i * 4 * 3;
        stscEntries.setUint32(offset, i + 1);
        stscEntries.setUint32(offset + 4, samplesPerChunkList[i]);
        stscEntries.setUint32(offset + 8, 1);
    }
    return new MP4Atom("stsc", [
        MP4.Uint32(0),
        MP4.Uint32(stscEntryCount), 
        stscEntries.buffer,
    ]);
}

MP4.stszBox = function(sampleSizeList) {
    var stszEntryCount = sampleSizeList.length;
    var stszEntries = new DataView(new ArrayBuffer(stszEntryCount * 4));
    var lastTimecode = 0;
    for (var i = 0; i < stszEntryCount; i++) {
        var offset = i * 4;
        stszEntries.setUint32(offset, sampleSizeList[i]);
    }
    return new MP4Atom("stsz", [
        MP4.Uint32(0),
        MP4.Uint32(0),
        MP4.Uint32(stszEntryCount), 
        stszEntries.buffer,
    ]);
}

MP4.stcoBox = function(chunkSizeList, fileOffset) {
    fileOffset = fileOffset || 0;
    var stcoEntryCount = chunkSizeList.length;
    var stcoEntries = new DataView(new ArrayBuffer(stcoEntryCount * 4));
    var position = fileOffset;
    for (var i = 0; i < stcoEntryCount; i++) {
        var offset = i * 4;
        stcoEntries.setUint32(offset, position);
        position += chunkSizeList[i];
    }
    return new MP4Atom("stco", [
        MP4.Uint32(0),
        MP4.Uint32(stcoEntryCount), 
        stcoEntries.buffer,
    ]);
}

MP4.mdatBox = function(mdatParts) {
    /*var size = 0;
    for (var i = 0; i < mdatParts.length; i++) {
        size += mdatParts[i].size || mdatParts[i].byteLength || 0;
    }
    console.log(size);
    var padding = new ArrayBuffer(8 - (size % 8));
    return new MP4Atom("mdat", mdatParts.concat([padding]));*/
    return new MP4Atom("mdat", mdatParts);
}

MP4.build = function(mkv, videoTrackNumber, save) {
    var timescale = Math.round(1000000000 / mkv.info.timecodeScale);
    var videoTrack = mkv.tracks.find(function(e){if (e.number == videoTrackNumber) return true; else return false;});
    
    var mkvFileBlob = mkv.wholeFileReader.blob;
    var mdatParts = [];
    var sampleDecodeTimeList = [];
    var syncSampleList = [];
    var samplesPerChunkList = [];
    var sampleSizeList = [];
    var chunkSizeList = [];
    var sampleNumber = 0;
    var totalTime = 0;
    for (var i = 0; i < mkv.clusters.length; i++) {
        var clusterTimecode = mkv.clusters[i].timecode;
        var chunkSize = 0;
        var samplesInChunk = 0;
        for (var j = 0; j < mkv.clusters[i].length; j++) {
            sampleNumber++;
            var sample = mkv.clusters[i][j];
            sampleDecodeTimeList.push(sample.timecode + clusterTimecode);
            totalTime = Math.max(totalTime, sample.timecode + clusterTimecode);
            if (sample.keyframe === true) syncSampleList.push(sampleNumber);
            samplesInChunk++;
            sampleSizeList.push(sample.frameDataLength);
            chunkSize += sample.frameDataLength;
            mdatParts.push(mkv.wholeFileReader.blob.slice(sample.frameDataLocation, sample.frameDataLocation + sample.frameDataLength));
        }
        samplesPerChunkList.push(samplesInChunk);
        chunkSizeList.push(chunkSize);
    }
    
    console.log(totalTime);
    
    mkv.info.duration = totalTime;
    
    var ftyp = MP4.ftypBox();
    var mdat = MP4.mdatBox(mdatParts);
    var moov = MP4.box("moov", [
        MP4.mvhdBox(timescale, mkv.info.duration),
        MP4.box("trak", [
            MP4.tkhdBox(1, mkv.info.duration, videoTrack.video.pixelWidth, videoTrack.video.pixelHeight),
            MP4.edtsBox(mkv.info.duration),
            MP4.box("mdia", [
                MP4.mdhdBox(timescale, mkv.info.duration),
                MP4.hdlrBox("vide"),
                MP4.box("minf", [
                    MP4.vmhdBox(),
                    MP4.dinfBox(),
                    MP4.box("stbl", [
                        MP4.stsdBoxAVC(videoTrack.video.pixelWidth, videoTrack.video.pixelHeight, videoTrack.codecPrivate),
                        MP4.sttsBox(sampleDecodeTimeList),
                        MP4.stssBox(syncSampleList),
                        MP4.stscBox(samplesPerChunkList),
                        MP4.stszBox(sampleSizeList),
                        MP4.stcoBox(chunkSizeList, 40),
                    ]),
                ]),
            ]),
        ]),
    ]);    
    
    fileParts = [ftyp.toBlob(), mdat.toBlob(), moov.toBlob()]
    if (save) saveAs(new Blob(fileParts), "test" + Date.now() + ".mp4");
    return new Blob(fileParts, {type:"video/mp4"});
}


// Array.prototype.find - MIT License (c) 2013 Paul Miller <http://paulmillr.com>
// For all details and docs: https://github.com/paulmillr/array.prototype.find
//minified
!function(){if(!Array.prototype.find){var r=function(r){var t=Object(this),e=t.length<0?0:t.length>>>0;if(0===e)return void 0;if("function"!=typeof r||"[object Function]"!==Object.prototype.toString.call(r))throw new TypeError("Array#find: predicate must be a function");for(var n,o=arguments[1],i=0;e>i;i++)if(n=t[i],r.call(o,n,i,t))return n;return void 0};if(Object.defineProperty)try{Object.defineProperty(Array.prototype,"find",{value:r,configurable:!0,enumerable:!1,writable:!0})}catch(t){}Array.prototype.find||(Array.prototype.find=r)}}(this);