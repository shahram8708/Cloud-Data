const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs').promises;
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

const uri = "mongodb+srv://ramcoding8:Shah6708@fileuploader.ltub2bp.mongodb.net/test?retryWrites=true&w=majority";
const clientOptions = { serverApi: { version: '1', strict: true, deprecationErrors: true } };

mongoose.connect(uri, clientOptions)
    .then(() => {
        console.log("Connected to MongoDB!");
    })
    .catch((error) => {
        console.error("Error connecting to MongoDB:", error);
    });

const fileSchema = new mongoose.Schema({
    deviceId: String,
    text: String,
    image: String,
    video: String,
    file: String,
    fileName: String,
    timestamp: { type: Date, default: Date.now },
    permanent: Boolean,
});

const FileModel = mongoose.model('File', fileSchema);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'uploads'));
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    },
});

const upload = multer({ storage: storage });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/saveData', upload.single('file'), async (req, res) => {
    const { text, image, video } = req.body;
    const { fileName } = req.body;

    let deviceId = req.cookies.deviceId;

    if (!deviceId) {
        deviceId = generateDeviceId();
        res.cookie('deviceId', deviceId, { maxAge: 3153600000000, httpOnly: true });
    }

    const newData = new FileModel({
        deviceId,
        text: text || '',
        image: image || '',
        video: video || '',
        file: req.file ? `/uploads/${req.file.filename}` : '',
        fileName: `${fileName || ''}`,
        permanent: true,
    });

    try {
        if (mongoose.connection.readyState !== 1) {
            throw new Error("MongoDB not connected");
        }
        await newData.save();
        res.send({ success: true, message: 'Data saved successfully.' });
    } catch (error) {
        console.error('Error saving data to MongoDB:', error);
        res.status(500).send({ success: false, message: 'Error saving data.' });
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

app.get('/getData', async (req, res) => {
    const deviceId = req.cookies.deviceId;

    if (!deviceId) {
        return res.status(400).send({ success: false, message: 'Device ID not found.' });
    }

    const { searchTerm } = req.query;

    let query = { deviceId };

    if (searchTerm) {
        query.$or = [
            { text: { $regex: new RegExp(searchTerm, 'i') } },
            { fileName: { $regex: new RegExp(searchTerm, 'i') } },
        ];
    }

    try {
        const userData = await FileModel.find(query);
        res.send({ data: userData });
    } catch (error) {
        console.error('Error fetching data from MongoDB:', error);
        res.status(500).send({ success: false, message: 'Error fetching data.' });
    }
});

app.post('/deleteData', async (req, res) => {
    try {
      const fileName = req.body.fileName;
      const deviceId = req.cookies.deviceId;
  
      if (!deviceId) {
        return res.status(400).send({ success: false, message: 'Device ID not found.' });
      }
  
      if (!fileName) {
        return res.status(400).send({ success: false, message: 'File name is empty.' });
      }
  
      const cleanFileName = fileName.replace(/^\/uploads\//, '');
      const filePath = path.join(__dirname, 'uploads', cleanFileName);
  
      const fileExists = await fs.access(filePath)
        .then(() => true)
        .catch(() => false);
  
      if (!fileExists) {
        return res.status(404).send({ success: false, message: 'File not found.' });
      }
  
      await fs.unlink(filePath);
  
      await FileModel.deleteOne({ deviceId, file: `/uploads/${cleanFileName}` });
  
      console.log('File and data deleted successfully:', fileName);
      res.send({ success: true, message: 'File and data deleted successfully.' });
    } catch (error) {
      console.error('Error deleting file and data:', error);
      res.status(500).send({ success: false, message: 'Error deleting file and data.' });
    }
  });
  

function generateDeviceId() {
    return 'device_' + Math.random().toString(36).substr(2, 9);
}
process.on('SIGINT', async () => {
    try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed due to app termination');
        process.exit(0);
    } catch (err) {
        console.error('Error closing MongoDB connection:', err);
        process.exit(1);
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
