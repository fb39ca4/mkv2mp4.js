EBML = {};

EBML.MAX_INITIAL_READ = 1024;
EBML.MAX_LIST_READ = 1048576;
EBML.MAX_READ_SIZE = 1000000;
EBML.DISCARD_DATA_VIEW = true;

EBML.specification = matroskaSpec;
EBML.textDecoder = new TextDecoder('utf-8');

function EBMLBlobReader(blob, offset, length) {
    this.blob = blob;
    this.fileOffset = offset || 0;
    this.length = length || blob.size - this.fileOffset;
}

EBMLBlobReader.prototype.readAsync = function(callback) {
    if (this.length > 150000000) throw "Blob is too big to read";
    var fr = new FileReader();
    fr.onload = function(){callback(fr.result)};
    fr.readAsArrayBuffer(this.blob.slice(this.fileOffset, this.fileOffset + this.length));
}

EBMLBlobReader.prototype.section = function(offset, length) {
    var newReader = new EBMLBlobReader(this.blob, this.fileOffset + offset, length);
    return newReader;
}

EBMLBlobReader.prototype.toBlob = function() {
    return this.blob.slice(this.fileOffset, this.fileOffset + this.length);
}

EBMLBlobReader.prototype.readElementAsync = function(callback, maxReadSize) {
    var element;
    var initialReader = this.section(0, maxReadSize || EBML.MAX_INITIAL_READ);
    var processHeader = function(result) {
        var dataView = new DataView(result);
        element = new EBMLElement(dataView, this);
        callback(null, element);
    }.bind(this);
    initialReader.readAsync(processHeader);
}

EBMLBlobReader.prototype.readElementListAsync = function(callback) {
    var onDataRead = function(result) {
        var dataView = new DataView(result);
        var ebmlList = new EBMLElementList(dataView);
        callback(ebmlList);
    }.bind(this);
    this.readAsync(onDataRead);
}

/*EBMLBlobReader.prototype.readElementListShallowAsync = function(callback) {
    var readPos = 0;
    var readLength = 1024;
    var reader = null;
    var elementList = [];
    var onDataRead = function(result) {
        var dataView = new DataView(result);
        var element = new EBMLElement(dataView, reader);
        element.contentsReader = this.section(readPos + element.headerByteLength, element.innerByteLength);
        readPos += element.outerByteLength;
        elementList.push(element);
        if (readPos < this.length) {
            readData();
        }
        else callback(elementList);
    }.bind(this);
    var readData = function() {
        reader = this.section(readPos, readLength);
        reader.readAsync(onDataRead);
    }.bind(this);
    readData();
}*/

function EBMLElement(dataView, asyncReader) {
    this.dataView = dataView;
    this.readPos = 0;
    this.id = this.readId();
    this.innerByteLength = this.readLength();
    this.outerByteLength = this.readPos + this.innerByteLength;
    this.headerByteLength = this.readPos;
    
    this.type = EBML.specification.getType(this.id);
    this.name = EBML.specification.getName(this.id);
    
    if (dataView.byteLength < this.outerByteLength) {
        this.contentsReader = asyncReader.section(this.headerByteLength, this.innerByteLength);
        if (EBML.DISCARD_DATA_VIEW) {
            delete this.dataView;
            delete this.readPos;
        }
        return;
    }
    
    switch (this.type) {
        case "master":
        case "container":
            this.childElements = this.readMaster();
            break;
        case "uinteger":
            this.value = this.readUint();
            break;
        case "integer":
            this.value = this.readInt();
            break;
        case "float":
            this.value = this.readFloat();
            break;
        case "string":
        case "utf-8":
            this.value = this.readString();
            break;
        case "binary":
            this.value = this.readBinary();
            break;
        case "ebmlid":
            this.value = this.readId();
            break;
        default:
            break;
    }
    if (dataView.byteLength >= this.outerByteLength + 12) {
        this.readPos = this.outerByteLength;
        this.readId();
        this.nextOuterByteLength = this.readLength() + this.readPos - this.outerByteLength;
    }
    if (EBML.DISCARD_DATA_VIEW) {
        delete this.dataView;
        delete this.readPos;
    }
}

EBMLElement.prototype.getChildrenAsync = function(callback) {
    if (this.innerByteLength > EBML.MAX_LIST_READ) {
        this.getChildrenShallowAsync(callback);
    }
    else {
        this.getChildrenDeepAsync(callback);
    }
}

EBMLElement.prototype.getChildrenDeepAsync = function(callback) {
    if (this.childElements) {
        callback(this.childElements);
        return;
    }
    onChildElementsRead = function(childElements) {
        this.childElements = childElements;
        callback(this.childElements);
        return;
    }.bind(this);
    this.contentsReader.readElementListAsync(onChildElementsRead);
}

EBMLElement.prototype.getChildrenShallowAsync = function(callback) {
    if (this.childElements) {
        callback(this.childElements);
        return;
    }
    onChildElementsRead = function(childElements) {
        this.childElements = childElements;
        callback(this.childElements);
        return;
    }.bind(this);
    this.contentsReader.readElementListShallowAsync(onChildElementsRead);
}

EBMLElement.prototype.getChildWithNameAsync = function(name, callback) {
    onChildElementsRead = function(childElements) {
        this.childElements = childElements;
        for (var i in this.childElements) {
            if (this.childElements[i].name == name) {;
                callback(this.childElements[i]);
                return;
            }
        }
    }.bind(this);
    if (this.childElements) onChildElementsRead(this.childElements);
    else this.contentsReader.readElementListShallowAsync(onChildElementsRead);
}

EBMLElement.prototype.getChildWithName = function(name) {
    if (!this.childElements) throw "EBMLElement: Child elements not read";
    for (var i in this.childElements) {
        if (this.childElements[i].name == name) {;
            return this.childElements[i];
        }
    }
}

EBMLElement.prototype.filterChildrenWithName = function(name) {
    if (!this.childElements) throw "EBMLElement: Child elements not read";
    var filterFunc = function(element) {
        if (element.name == name) return true;
        else return false;
    }
    return this.childElements.filter(filterFunc);
}

EBMLElement.prototype.getChildAtOffsetAsync = function(offset, callback) {
    onChildElementRead = function(childElement) {
        callback(childElement);
        return;
    }.bind(this);
    this.contentsReader.section(offset).readElementAsync(onChildElementRead);
}

EBMLElement.decodeString = (new TextEncoder("utf-8")).decode;

EBMLElement.prototype.countLeadingZeroes = function(b) {
    b = b & 0xFF;
    var mask = 0xFF;
    var count;
    for (count = 8; count >= 0; count--) {
        if ((b & mask) == 0) break;
        mask = (mask << 1) & 0xFF;
    }
    return count;
}

EBMLElement.prototype.readLength = function() {
    var length = 0;
    length += this.countLeadingZeroes(this.dataView.getUint8(this.readPos)) + 1;
    var result = 0;
    for (var i = 0; i < length; i++) {
        var read = this.dataView.getUint8(this.readPos + i);
        if (i == 0) read = read & (0xFF >> length);
        result *= 256;
        result += read;
    }
    this.readPos += length;
    return result;
}

EBMLElement.prototype.readId = function() {
    var length = 0;
    length += this.countLeadingZeroes(this.dataView.getUint8(this.readPos)) + 1;
    var result = "";
    for (var i = 0; i < length; i++) {
        var read = this.dataView.getUint8(this.readPos + i);
        //if (i == 0) read = read & (0xFF >> length);
        result += read.toString(16);
    }
    this.readPos += length;
    return "0x" + result.toUpperCase();
}

EBMLElement.prototype.readInt = function() {
    var dataView = new DataView(this.dataView.buffer, this.dataView.byteOffset + this.readPos);
    var result = 0;
    if (dataView.getUint8(0) & 0x80) {
        for (var i = 0; i < this.innerByteLength; i++) {
                result *= 256;
                result += dataView.getUint8(i) ^ 0xFF;
        }
        return -(result + 1);
    }
    else {
        for (var i = 0; i < this.innerByteLength; i++) {
            result *= 256;
            result += dataView.getUint8(i);
        }
        return result;
    }
}

EBMLElement.prototype.readUint = function () {
    var dataView = new DataView(this.dataView.buffer, this.dataView.byteOffset + this.readPos);
    var result = 0;
    for (var i = 0; i < this.innerByteLength; i++) {
        result *= 256;
        result += dataView.getUint8(i);
    }
    return result;
}

EBMLElement.prototype.readFloat = function () {
    var dataView = new DataView(this.dataView.buffer, this.dataView.byteOffset + this.readPos);
    if (this.innerByteLength == 4) return dataView.getFloat32(0);
    else if (this.innerByteLength == 8) return dataView.getFloat64(0);
    else return NaN;
}

EBMLElement.prototype.readString = function() {
    var arrayBuf = this.dataView.buffer.slice(this.dataView.byteOffset + this.headerByteLength, this.dataView.byteOffset + this.headerByteLength + this.innerByteLength);
    return EBML.textDecoder.decode(arrayBuf);
}

EBMLElement.prototype.readBinary = function() {
    return this.dataView.buffer.slice(this.dataView.byteOffset + this.headerByteLength, this.dataView.byteOffset + this.headerByteLength + this.innerByteLength);
}

EBMLElement.prototype.readMaster = function() {
    var dataView = new DataView(this.dataView.buffer, this.dataView.byteOffset + this.readPos);
    return new EBMLElementList(dataView, this.innerByteLength);
}

function EBMLElementList(dataView, length) {
    this.dataView = dataView;
    length = length || (this.dataView.byteLength - this.dataView.byteOffset);
    this.readPos = 0;
    while (this.readPos < length) {
        var element = new EBMLElement(new DataView(this.dataView.buffer, this.dataView.byteOffset + this.readPos));
        element.relativeOffset = this.readPos;
        this.readPos += element.outerByteLength;
        this.push(element);
    }
    if (EBML.DISCARD_DATA_VIEW) delete this.dataView;
}

EBMLElementList.prototype = new Array;

function MKVParser(reader) {
    this.wholeFileReader = reader;
}

MKVParser.prototype.initialize = function(callback) {
    var file = this.wholeFileReader;
    async.auto({
        firstElement: function(callback, results) {
            file.readElementAsync(callback);
        },
        isMatroska: ["firstElement", function(callback, results) {
            var firstElement = results.firstElement;
            if (firstElement.name != "EBML") {
                callback("first element in file is not 'EBML'", false);
                return;
            }
            if (!firstElement.childElements) {
                callback("EBML header is unusually large.");
                return;
            }
            for (i in firstElement.childElements) {
                if (firstElement.childElements[i].name == "DocType") {
                    if (firstElement.childElements[i].value == "matroska") {
                        callback(null, true);
                        return;
                    }
                    else callback("DocType is " + firstElement.childElements[i].value + ". Expected 'matroska'", false);
                    return;
                }
            }
            callback("Could not find DocType", false);
            return;
        }],
        secondElement: ["isMatroska", function(callback, results) {
            var offset = results.firstElement.outerByteLength;
            file.section(offset).readElementAsync(callback);
        }],
        segmentReader: ["secondElement", function(callback, results) {
            var secondElement = results.secondElement;
            if (secondElement.name != "Segment") callback("Expected 'Segment' as second element");
            callback(null, secondElement.contentsReader);
        }],
        seekHeadElement: ["segmentReader", function(callback, results) {
            results.segmentReader.readElementAsync(callback);
        }],
        seekHead: ["seekHeadElement", function(callback, results) {
            if (results.seekHeadElement.name != "SeekHead") callback("Expected 'SeekHead' to be the first child element in 'Segment'");
            var seekHeadElements = results.seekHeadElement.childElements;
            var seek = {}
            for (var i in seekHeadElements) {
                var a = seekHeadElements[i];
                if (a.name != "Seek") continue;
                var elementName = null; var elementPosition = null;
                for (var j in a.childElements) {
                    var b = a.childElements[j];
                    if (b.name == "SeekID") {
                        elementName = matroskaSpec.getName(b.value);
                    }
                    else if (b.name == "SeekPosition") {
                        elementPosition = b.value;
                    }
                }
                if (typeof elementName == "string") {
                    if (typeof elementPosition == "number") {
                        seek[elementName] = elementPosition;
                    }
                } 
            }
            callback(null, seek);
        }],
        infoElement: ["seekHead", function(callback, results) {
            if (!results.seekHead["Info"]) callback("No entry for 'Info' in 'SeekHead'");
            results.segmentReader.section(results.seekHead["Info"]).readElementAsync(getChildren);
            function getChildren(error, result) {
                if (error) callback("Error reading 'Info' element.");
                else {
                    result.getChildrenDeepAsync(function(){callback(null,result)});
                }
            }
        }],
        tracksElement: ["seekHead", function(callback, results) {
            if (!results.seekHead["Tracks"]) callback("No entry for 'Tracks' in 'SeekHead'");
            results.segmentReader.section(results.seekHead["Tracks"]).readElementAsync(getChildren);
            function getChildren(error, result) {
                if (error) callback("Error reading 'Tracks' element.");
                else {
                    result.getChildrenDeepAsync(function(){callback(null,result)});
                }
            }
        }],
        chaptersElement: ["seekHead", function(callback, results) {
            if (!results.seekHead["Chapters"]) callback(null, null);//"No entry for 'Chapters' in 'SeekHead'");
            results.segmentReader.section(results.seekHead["Chapters"]).readElementAsync(getChildren);
            function getChildren(error, result) {
                if (error) callback(null, null);
                else {
                    result.getChildrenDeepAsync(function(){callback(null,result)});
                }
            }
        }],
        cuesElement: ["seekHead", function(callback, results) {
            if (!results.seekHead["Cues"]) callback("No entry for 'Cues' in 'SeekHead'");
            results.segmentReader.section(results.seekHead["Cues"]).readElementAsync(getChildren);
            function getChildren(error, result) {
                if (error) callback("Error reading 'Cues' element.");
                else {
                    result.getChildrenDeepAsync(function(){callback(null,result)});
                }
            }
        }],
        info: ["infoElement", function(callback, results) {
            if (results.infoElement.name != "Info") callback("'SeekHead' entry for 'Info' does not point to an 'Info' element.");
            var infoObject = {};
            a = results.infoElement.getChildWithName("TimecodeScale");
            if (a) infoObject.timecodeScale = a.value;
            a = results.infoElement.getChildWithName("Duration")
            if (a) infoObject.duration = a.value;
            a = results.infoElement.getChildWithName("Title")
            if (a) infoObject.title = a.value;
            callback(null, infoObject);
        }],
        tracks: ["tracksElement", function(callback, results) {
            if (results.tracksElement.name != "Tracks") callback("'SeekHead' entry for 'Tracks' does not point to a 'Tracks' element.");
            var tracks = [];
            var trackTypeMapping = {1:"video", 2:"audio", 3:"complex", 0x10:"logo", 0x11:"subtitle", 0x12:"buttons", 0x20:"control"}
            for (var i in results.tracksElement.childElements) {
                var track = results.tracksElement.childElements[i];
                if (track.name != "TrackEntry") continue;
                var t = {};                
                var a;
                a = track.getChildWithName("TrackNumber");
                if (a) t.number = a.value;
                a = track.getChildWithName("TrackUID");
                if (a) t.uid = a.value;
                a = track.getChildWithName("TrackType");
                if (a) t.type = trackTypeMapping[a.value];
                a = track.getChildWithName("FlagEnabled");
                if (a) t.flagEnabled = Boolean(a.value);
                a = track.getChildWithName("FlagDefault");
                if (a) t.flagDefault = Boolean(a.value);
                a = track.getChildWithName("FlagForced");
                if (a) t.flagForced = Boolean(a.value);
                a = track.getChildWithName("FlagLacing");
                if (a) t.flagForced = Boolean(a.value);
                a = track.getChildWithName("MinCache");
                if (a) t.minCache = a.value;
                a = track.getChildWithName("MaxBlockAdditionID");
                if (a) t.maxBlockAdditionID = a.value;
                a = track.getChildWithName("Name");
                if (a) t.name = a.value;
                a = track.getChildWithName("Language");
                if (a) t.language = a.value;
                a = track.getChildWithName("CodecID");
                if (a) t.codecID = a.value;
                a = track.getChildWithName("CodecPrivate");
                if (a) t.codecPrivate = a.value;
                a = track.getChildWithName("SeekPreRoll");
                if (a) t.seekPreRoll = a.value;
                a = track.getChildWithName("Video");
                if (a) {
                    var video = {};
                    var b;
                    b = a.getChildWithName("FlagInterlaced");
                    if (b) video.flagInterlaced = Boolean(b.value);
                    b = a.getChildWithName("StereoMode");
                    if (b) video.stereoMode = b.value;
                    b = a.getChildWithName("AlphaMode");
                    if (b) video.alphaMode = b.value;
                    b = a.getChildWithName("PixelWidth");
                    if (b) video.pixelWidth = b.value;
                    b = a.getChildWithName("PixelHeight");
                    if (b) video.pixelHeight = b.value;
                    b = a.getChildWithName("PixelCrop");
                    if (b) video.pixelCrop = b.value;
                    b = a.getChildWithName("PixelCropBottom");
                    if (b) video.pixelCropBottom = b.value;
                    b = a.getChildWithName("PixelCropTop");
                    if (b) video.pixelCropTop = b.value;
                    b = a.getChildWithName("PixelCropLeft");
                    if (b) video.pixelCropLeft = b.value;
                    b = a.getChildWithName("DisplayWidth");
                    if (b) video.displayWidth = b.value;
                    b = a.getChildWithName("DisplayHeight");
                    if (b) video.displayHeight = b.value;
                    b = a.getChildWithName("DisplayUnit");
                    if (b) video.displayUnit = b.value;
                    b = a.getChildWithName("ColourSpace");
                    if (b) video.colourSpace = b.value;
                    t.video = video;
                }
                a = track.getChildWithName("Audio");
                if (a) {
                    var audio = {};
                    var b;
                    b = a.getChildWithName("SamplingFrequency");
                    if (b) audio.samplingFrequency = b.value;
                    b = a.getChildWithName("OutputSamplingFrequency");
                    if (b) audio.outputSamplingFrequency = b.value;
                    b = a.getChildWithName("Channels");
                    if (b) audio.channels = b.value;
                    b = a.getChildWithName("BitDepth");
                    if (b) audio.bitDepth = b.value;
                    t.audio = audio;
                }
                a = track.getChildWithName("ContentEncodings");
                if (a) t.contentEncoding = true;
                tracks.push(t);
            }
            callback(null, tracks);
        }],
        cues: ["cuesElement", function(callback, results) {
            if (results.cuesElement.name != "Cues") callback("'SeekHead' entry for 'Cues' does not point to a 'Cues' element.");
            var cues = [];
            for (var i in results.cuesElement.childElements) {
                var cue = results.cuesElement.childElements[i];
                if (cue.name != "CuePoint") continue;
                var p = {};
                var a;
                a = cue.getChildWithName("CueTime");
                if (a) p.time = a.value;
                p.trackPositions = [];
                for (var i in cue.childElements) {
                    a = cue.childElements[i];
                    if (a.name != "CueTrackPositions") continue;
                    var b;
                    var tp = {};
                    b = a.getChildWithName("CueTrack");
                    if (b) tp.track = b.value;
                    b = a.getChildWithName("CueClusterPosition");
                    if (b) tp.clusterPosition = b.value;
                    b = a.getChildWithName("CueRelativePosition");
                    if (b) tp.relativePosition = b.value;
                    b = a.getChildWithName("CueDuration");
                    if (b) tp.duration = b.value;
                    p.trackPositions.push(tp);
                }
                cues.push(p);
            }
            callback(null, cues);
        }],
    }, function(error, results) {
        if (error) console.log("Error: ", error);
        this.results = results;
        
        this.segment = results.secondElement;
        this.segmentReader = results.segmentReader;
        this.seekHead = results.seekHead;
        this.info = results.info;
        this.tracks = results.tracks;
        this.cues = results.cues;
        console.log(this);
        callback();
    }.bind(this));
};

MKVParser.prototype.readClusters = function(callback, trackNumbers) {
    var isWantedTrackNumber = function() {return true};
    if (trackNumbers) isWantedTrackNumber = function(trackNum) {
        for (var i in trackNumbers) if (trackNumbers[i] == trackNum) return true;
        return false;
    }
    var segmentReader = this.segmentReader;
    var segment = this.segment;
    var segmentOffset = 0;
    var maxReadPos = this.segment.innerByteLength;
    var maxHeaderLength = 16;
    this.clusters = [];
    var clusters = this.clusters;
    function onFirstRead(unused, result) {
        segmentReader.readElementAsync(onRead, result.outerByteLength + maxHeaderLength);
    }
    function onRead(unused, result) {
        var element = result;
        element.relativeOffset = segmentOffset;
        if (element.name == "Cluster") {
            console.log(element.name);
            var cluster = element;
            var clusterTimecode;
            var c = [];
            for (var i in cluster.childElements) {
                if (cluster.childElements[i].name == "Timecode") {
                    clusterTimecode = cluster.childElements[i].value;
                    break;
                }
            }
            if (typeof clusterTimecode == "number") {
                for (var i in cluster.childElements) {
                    if (cluster.childElements[i].name == "SimpleBlock") {
                        var sbe = cluster.childElements[i];
                        var block = MKVParser.readSimpleBlock(sbe.value);
                        if (!isWantedTrackNumber(block.trackNumber)) continue;
                        block.frameDataLocation = segmentReader.fileOffset + cluster.relativeOffset + cluster.headerByteLength + sbe.relativeOffset + sbe.headerByteLength + block.frameDataOffset;
                        c.push(block);
                    }
                }
            }
            c.timecode = clusterTimecode;
            clusters.push(c);
        }
        segmentOffset += element.outerByteLength;
        if (segmentOffset > maxReadPos) {
            onFinish();
            return;
        }
        if (!element.nextOuterByteLength) {
            onFinish();
            return;
        }
        segmentReader.section(segmentOffset).readElementAsync(onRead, element.nextOuterByteLength + maxHeaderLength);
    }
    function onFinish() {
        callback();
    }
    this.segmentReader.readElementAsync(onFirstRead, maxHeaderLength);
    
}



MKVParser.readSimpleBlock = function(arrayBuf) {
    var readTrackNumber = function() {
        var countLeadingZeroes = function(b) {
            b = b & 0xFF;
            var mask = 0xFF;
            var count;
            for (count = 8; count >= 0; count--) {
                if ((b & mask) == 0) break;
                mask = (mask << 1) & 0xFF;
            }
            return count;
        }
        var length = 0;
        length += countLeadingZeroes(d.getUint8(readPos)) + 1;
        var result = 0;
        for (var i = 0; i < length; i++) {
            var read = d.getUint8(readPos + i);
            if (i == 0) read = read & (0xFF >> length);
            result *= 256;
            result += read;
        }
        readPos += length;
        return result;
    }
    
    var block = {};
    var d = new DataView(arrayBuf);
    var readPos = 0;
    block.trackNumber = readTrackNumber();
    block.timecode = d.getInt16(readPos);
    readPos += 2;
    var flags = d.getUint8(readPos);
    readPos += 1;
    block.keyframe = Boolean(flags & 0x80);
    block.invisible = Boolean(flags & 0x08);
    block.lacing = Boolean(flags & 0x06);
    block.discardable = Boolean(flags & 0x01);
    block.frameDataOffset = readPos;
    block.frameDataLength = arrayBuf.byteLength - readPos;
    return block;
}

MKVParser.prototype.blockSizeStatistics = function(trackNumber) {
    trackNumber = trackNumber || 1;
    var sizeCount = 0;
    var blockCount = 0;
    var keyframeCount = 0;
    for (var i in this.clusters) {
        for (var j in this.clusters[i]) {
            if (this.clusters[i][j].trackNumber != trackNumber) continue;
            if (this.clusters[i][j].keyframe) keyframeCount++;
            blockCount++;
            sizeCount += mkv.clusters[i][j].frameDataLength;
        }
    }
    console.log(sizeCount, blockCount, sizeCount / blockCount, keyframeCount);
}