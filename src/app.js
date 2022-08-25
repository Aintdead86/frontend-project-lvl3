import 'bootstrap';
import './styles/styles.scss';

import * as yup from 'yup';
import i18next from 'i18next';
import axios from 'axios';
import _ from 'lodash';
import ru from './locales/ru.js';
import watcher from './view.js';

import { pullNewFeeds, parseRss } from './rssParser.js';

const getResponse = (url) => axios.get(pullNewFeeds(url));

const app = () => {
  const defaultLanguage = 'ru';

  const i18nextInstance = i18next.createInstance();
  i18nextInstance.init({
    lng: defaultLanguage,
    debug: false,
    resources: {
      ru,
    },
  });

  yup.setLocale({
    string: {
      url: 'invalidUrl',
    },
    mixed: {
      notOneOf: 'urlAlreadyAdded',
    },
  });

  const state = {
    rssForm: {
      processState: 'filling',
      errors: null,
    },
    addedUrls: [],
    viewedPosts: [],
    feeds: [],
    posts: [],
  };

  let feedCounter = 0;
  let postCounter = 0;

  const watchedState = watcher(state, i18nextInstance);

  const rssForm = document.querySelector('.rss-form');
  const postsContainer = document.querySelector('.posts');

  rssForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newUrl = formData.get('url');

    const schema = yup
      .string()
      .required()
      .url()
      .notOneOf(watchedState.addedUrls);

    schema.validate(newUrl)
      .then((link) => {
        watchedState.rssForm.processState = 'loading';
        watchedState.rssForm.errors = null;
        watchedState.addedUrls.push(link);
        return getResponse(link);
      })
      .then((response) => {
        const parsedData = parseRss(response.data.contents);
        feedCounter += 1;
        parsedData.feed.id = feedCounter;
        watchedState.feeds.unshift(parsedData.feed);
        parsedData.posts.forEach((post) => {
          postCounter += 1;
          Object.assign(post, { id: postCounter, feedId: parsedData.feed.id });
        });
        watchedState.posts = parsedData.posts.concat(watchedState.posts);
        watchedState.rssForm.processState = 'success';
        watchedState.rssForm.errors = null;
      })
      .catch((err) => {
        watchedState.rssForm.processState = 'fault';
        if (err.message === 'Network Error') {
          watchedState.rssForm.errors = 'networkError';
        } else {
          watchedState.rssForm.errors = err.message;
        }
      });
  });

  postsContainer.addEventListener('click', (e) => {
    const selectedPost = watchedState.posts
      .flatMap((el) => (el.id === Number(e.target.dataset.id) ? el.id : []));
    watchedState.viewedPosts = selectedPost.concat(watchedState.viewedPosts);
  });

  const getUpdatedPosts = () => {
    const promises = watchedState.addedUrls.map((addedUrl) => getResponse(addedUrl)
      .then((updatedResponse) => parseRss(updatedResponse.data.contents))
      .then((parsedContents) => {
        const { feed, posts } = parsedContents;
        watchedState.feeds.forEach((oldFeed) => {
          if (oldFeed.title === feed.title) {
            feed.id = oldFeed.id;
          }
        });
        const newPosts = _.differenceBy(posts, watchedState.posts, 'title');
        newPosts.forEach((newPost) => {
          postCounter += 1;
          Object.assign(newPost, { id: postCounter, feedId: feed.id });
        });
        watchedState.posts = newPosts.concat(watchedState.posts);
      })
      .catch((err) => {
        watchedState.rssForm.processState = 'fault';
        if (err.message === 'Network Error') {
          watchedState.rssForm.errors = 'networkError';
        }
      }));
    Promise.all(promises).then(() => setTimeout(() => getUpdatedPosts(), 5000));
  };
  getUpdatedPosts();
};

export default app;
