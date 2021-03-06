const User = require("../../models/user");
const Topic = require("../../models/topic");
const Category = require("../../models/category");
const Message = require("../../models/message");
const Tag = require("../../models/tag");
const {
  authenticationError,
  categoryRemovedError,
  topicRemovedError,
  noAuthorizationError,
  categoryArchivedError,
} = require("../variables/errorMessages");
const {
  topicDeleteResult,
  topicArchiveResult,
  topicUnarchiveResult,
} = require("../variables/resultMessages");
const {
  findUniqueTags,
} = require("../utils/findUniqueTags");

module.exports = {
  topics: async () => {
    try {
      let topics = await Topic.find({}).populate("createdBy tags").lean();
      return topics;
    } catch (err) {
      console.log(err);
      throw err;
    }
  },

  createTopic: async (args, req) => {
    if (!req.isAuth) {
      throw new Error(authenticationError);
    }
    if (req.currentUser.isBlocked || req.currentUser.isRemoved) {
      throw new Error(noAuthorizationError);
    }
    try {
      const category = await Category.findById(args.topicInput.parentCategory);
      if (!category) {
        throw new Error(categoryRemovedError);
      }
      if (category.isArchived === false) {
        let topic = new Topic({
          name: args.topicInput.name,
          description: args.topicInput.description,
          tagString: args.topicInput.tagString,
          parentCategory: args.topicInput.parentCategory,
          createdBy: req.currentUser.id,
        });
        if (args.topicInput.tagString) {
          let uniqueTagStringArray = findUniqueTags(args.topicInput.tagString);
          for (const stringTag of uniqueTagStringArray) {
            let tag = await Tag.findOne({ name: stringTag });
            if (tag) {
              tag.topics.push(topic);
            } else {
              tag = new Tag({
                name: stringTag,
                topics: [topic],
              });
            }
            await tag.save();
            topic.tags.push(tag);
          }
        }
        await topic.save();
        category.topics.push(topic);
        await category.save();
        const user = await User.findById(req.currentUser.id);
        user.topicsCreated.push(topic);
        await user.save();
        topic = await Topic.findById(topic._id)
          .populate("createdBy tags")
          .lean();
        return topic;
      } else {
        throw new Error(categoryArchivedError);
      }
    } catch (err) {
      console.log(err);
      throw err;
    }
  },

  getTopic: async (args) => {
    try {
      const topic = await Topic.findById(args.topicFindInput._id)
        .populate("tags createdBy pinnedMessages announcements")
        .lean();
      if (!topic) {
        throw new Error(topicRemovedError);
      }
      const { announcements, pinnedMessages } = topic;
      delete topic.announcements;
      delete topic.pinnedMessages;
      return {
        topic,
        pinnedMessages,
        announcements,
      };
    } catch (err) {
      console.log(err);
      throw err;
    }
  },

  getTopicChats: async (args) => {
    try {
      const topic = await Topic.findById(args.topicFindInput._id)
        .populate("chats")
        .lean();
      if (!topic) {
        throw new Error(topicRemovedError);
      }
      topic.chats = topic.chats.map((chat) => {
        let user = User.findById(chat.userId, "_id name").lean();
        chat.user = user;
        return chat;
      });
      return topic.chats;
    } catch (err) {
      console.log(err);
      throw err;
    }
  },

  updateTopic: async (args, req) => {
    if (!req.isAuth) {
      throw new Error(authenticationError);
    }
    if (req.currentUser.isBlocked || req.currentUser.isRemoved) {
      throw new Error(noAuthorizationError);
    }
    try {
      let topic = await Topic.findById(args.topicInput._id);
      if (!topic) {
        throw new Error(topicRemovedError);
      }
      if (
        topic.createdBy.toString() == req.currentUser.id ||
        req.currentUser.isModerator
      ) {
        let oldUniqueTagStringArray = [];
        let newUniqueTagStringArray = [];
        if (topic.tagString) {
          oldUniqueTagStringArray = findUniqueTags(topic.tagString);
        }
        topic.name = args.topicInput.name;
        topic.description = args.topicInput.description;
        topic.tagString = args.topicInput.tagString;
        newUniqueTagStringArray = findUniqueTags(args.topicInput.tagString);
        const oldRemovableTags = oldUniqueTagStringArray.filter(
          (tag) => !newUniqueTagStringArray.includes(tag)
        );
        for (const stringTag of oldRemovableTags) {
          const tag = await Tag.findOne({ name: stringTag });
          topic.tags = topic.tags.filter(
            (tagId) => tagId.toString() != tag._id
          );
          tag.topics = tag.topics.filter(
            (topicId) => topicId.toString() != args.topicInput._id
          );
          if (tag.topics.length == 0) {
            await tag.remove();
          } else {
            await tag.save();
          }
        }
        const newAddableTags = newUniqueTagStringArray.filter(
          (tag) => !oldUniqueTagStringArray.includes(tag)
        );
        for (const stringTag of newAddableTags) {
          let tag = await Tag.findOne({ name: stringTag });
          if (tag) {
            tag.topics.push(topic);
          } else {
            tag = new Tag({
              name: stringTag,
              topics: [topic],
            });
          }
          await tag.save();
          topic.tags.push(tag);
        }
        await topic.save();
        topic = await Topic.findById(args.topicInput._id)
          .populate("createdBy tags")
          .lean();
        return topic;
      }
      throw new Error(noAuthorizationError);
    } catch (err) {
      console.log(err);
      throw err;
    }
  },

  deleteTopic: async (args, req) => {
    if (!req.isAuth) {
      throw new Error(authenticationError);
    }
    if (req.currentUser.isBlocked || req.currentUser.isRemoved) {
      throw new Error(noAuthorizationError);
    }
    try {
      const topic = await Topic.findById(args.topicFindInput._id);
      if (!topic) {
        throw new Error(topicRemovedError);
      }
      if (
        topic.createdBy.toString() == req.currentUser.id ||
        req.currentUser.isModerator
      ) {
        if (topic.tags.length !== 0) {
          for (const stringTag of topic.tags) {
            const tag = await Tag.findById(stringTag);
            topic.tags = topic.tags.filter(
              (tagId) => tagId.toString() != tag._id
            );
            tag.topics = tag.topics.filter(
              (topicId) => topicId.toString() != args.topicFindInput._id
            );
            if (tag.topics.length == 0) {
              await tag.remove();
            } else {
              await tag.save();
            }
          }
        }
        await topic.remove();
        await Message.deleteMany({ parentTopic: args.topicFindInput._id });
        const user = await User.findById(topic.createdBy);
        user.topicsCreated = user.topicsCreated.filter(
          (topicId) => topicId.toString() != args.topicFindInput._id
        );
        await user.save();
        const category = await Category.findById(topic.parentCategory);
        if (!category) {
          throw new Error(categoryRemovedError);
        }
        category.topics = category.topics.filter(
          (topicId) => topicId.toString() != args.topicFindInput._id
        );
        await category.save();
        return { result: topicDeleteResult };
      }
      throw new Error(noAuthorizationError);
    } catch (err) {
      console.log(err);
      throw err;
    }
  },

  archiveTopic: async (args, req) => {
    if (!req.isAuth) {
      throw new Error(authenticationError);
    }
    if (req.currentUser.isBlocked || req.currentUser.isRemoved) {
      throw new Error(noAuthorizationError);
    }
    try {
      const topic = await Topic.findById(args.topicFindInput._id);
      if (!topic) {
        throw new Error(topicRemovedError);
      }
      if (
        topic.createdBy.toString() == req.currentUser.id ||
        req.currentUser.isModerator
      ) {
        if (topic.isArchived == true) {
          throw new Error(noAuthorizationError);
        }
        topic.isSelfArchived = true;
        await topic.save();
        return { result: topicArchiveResult };
      }
      throw new Error(noAuthorizationError);
    } catch (err) {
      console.log(err);
      throw err;
    }
  },

  unarchiveTopic: async (args, req) => {
    if (!req.isAuth) {
      throw new Error(authenticationError);
    }
    if (req.currentUser.isBlocked || req.currentUser.isRemoved) {
      throw new Error(noAuthorizationError);
    }
    try {
      const topic = await Topic.findById(args.topicFindInput._id);
      if (!topic) {
        throw new Error(topicRemovedError);
      }
      if (
        topic.createdBy.toString() == req.currentUser.id ||
        req.currentUser.isModerator
      ) {
        if (topic.isArchived == true) {
          throw new Error(noAuthorizationError);
        }
        topic.isSelfArchived = false;
        await topic.save();
        return { result: topicUnarchiveResult };
      }
      throw new Error(noAuthorizationError);
    } catch (err) {
      console.log(err);
      throw err;
    }
  },

  getTopicTasks: async (args) => {
    try {
      const topic = await Topic.findById(args.topicFindInput._id)
        .populate("tasks")
        .lean();
      if (!topic) {
        throw new Error(topicRemovedError);
      }
      topic.tasks = topic.tasks.filter((task) => {
        return !task.isCompleted;
      });
      topic.tasks = topic.tasks.map(async (task) => {
        if (task.attachedMessage != undefined) {
          const message = await Message.findById(task.attachedMessage).lean();
          task.description = message.description;
          task.parentTopic = message.parentTopic;
        }
        return task;
      });
      return topic.tasks;
    } catch (err) {
      console.log(err);
      throw err;
    }
  },
};
